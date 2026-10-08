import { asc, desc, eq } from "drizzle-orm";
import type { Tx } from "../db";
import { auditLog, bureauChecks, cohortFlags, config as configTable, consents, creditLines, cycles, inflowTxns, kycRecords, underwritingDecisions, users } from "../db/schema";
import { clearConfigCache, getConfig } from "../config";
import { configProblems, configSchema, type ConfigKey } from "../config/schema";
import { demoMode, realToday, todayFor } from "../clock";
import { addDays, daysBetween } from "../engine/dates";
import { unpaidOf, UserError, audit, getLine } from "./common";
import { CONSENT_PURPOSES, runUnderwriting } from "./onboarding";
import { processLine, recomputeBrakes } from "./daily";
import { repayAll } from "./line";

// ---------- config editor ----------
export async function listConfig(tx: Tx) {
  return tx.select().from(configTable).orderBy(asc(configTable.key));
}

/** Validate one value against its rule, then the whole set for cross-field problems, then save. */
export async function updateConfig(tx: Tx, actor: string, key: string, value: unknown) {
  const shape = configSchema.shape as Record<string, (typeof configSchema.shape)[ConfigKey]>;
  if (!(key in shape)) throw new UserError(`Unknown config key "${key}".`);
  const one = shape[key].safeParse(value);
  if (!one.success) throw new UserError(`${key}: ${one.error.issues[0]?.message ?? "invalid value"}`);
  const current = await getConfig(tx);
  const merged = { ...current, [key]: one.data };
  const problems = configProblems(merged);
  if (problems.length) throw new UserError(problems.join(" "));
  const [before] = await tx.select().from(configTable).where(eq(configTable.key, key));
  await tx
    .update(configTable)
    .set({ value: one.data, version: (before?.version ?? 0) + 1, updatedAt: new Date(), updatedBy: actor })
    .where(eq(configTable.key, key));
  await audit(tx, actor, "config_edit", `config:${key}`, { value: before?.value, version: before?.version }, { value: one.data, version: (before?.version ?? 0) + 1 });
  clearConfigCache();
}

export async function listUsers(tx: Tx) {
  const rows = await tx
    .select({ user: users, line: creditLines })
    .from(users)
    .leftJoin(creditLines, eq(creditLines.userId, users.id))
    .orderBy(desc(users.createdAt));
  return rows.map(({ user, line }) => ({
    id: user.id,
    name: user.deletedAt ? "(deleted)" : user.fullName,
    email: user.email,
    role: user.role,
    cohort: user.cohort,
    isDemo: user.isDemo,
    clockOffsetDays: user.clockOffsetDays,
    line: line ? { status: line.status, currentLimit: line.currentLimit, autopayOn: line.autopayOn, forceAutopayFail: line.forceAutopayFail } : null,
  }));
}

export async function recentAudit(tx: Tx, limit = 100) {
  return tx.select().from(auditLog).orderBy(desc(auditLog.at)).limit(limit);
}

// ---------- demo tools (DEMO_MODE=true only) ----------
function requireDemo() {
  if (!demoMode()) throw new UserError("Demo tools are switched off. Set DEMO_MODE=true.", 403);
}

export type TestUserInput = {
  fullName: string;
  dob: string;
  monthlyInflows: number[];
  bounce: boolean;
  overdueAmount: number | null;
};

/**
 * Creates a user through the SAME engines a real user goes through. Nothing is pre-filled: every
 * value comes from what the admin typed. Statement months end with the current month.
 */
export async function createTestUser(tx: Tx, actor: string, input: TestUserInput) {
  requireDemo();
  const today = realToday();
  const [u] = await tx
    .insert(users)
    .values({ fullName: input.fullName, dob: input.dob, cohort: today.slice(0, 7), isDemo: true, enrolmentVerified: true, enrolmentMethod: "demo" })
    .returning();
  for (const type of ["kyc", "aa", "bureau"] as const) {
    await tx.insert(consents).values({ userId: u.id, type, granted: true, purpose: CONSENT_PURPOSES[type], grantedAt: new Date() });
  }
  await tx.insert(kycRecords).values({ userId: u.id, panLast4: "DEMO", aadhaarLast4: "DEMO", provider: "demo" });
  await tx.insert(bureauChecks).values({
    userId: u.id,
    status: input.overdueAmount ? "active_default" : "clean",
    overdueAmount: input.overdueAmount ?? 0,
    sourceLabel: "self-declared (sandbox)",
  });
  const [y, m] = today.split("-").map(Number);
  const n = input.monthlyInflows.length;
  const rows = input.monthlyInflows.map((amount, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return { userId: u.id, date: d.toISOString().slice(0, 10), amount, description: "Monthly inflow (demo)", kind: "credit" as const, source: "manual" as const };
  });
  if (rows.length) await tx.insert(inflowTxns).values(rows);
  if (input.bounce) {
    await tx.insert(inflowTxns).values({ userId: u.id, date: addDays(today, -1), amount: 0, description: "BOUNCE (demo)", kind: "bounce", source: "manual" });
  }
  await audit(tx, actor, "demo_user_created", `users:${u.id}`, null, { name: input.fullName });
  if (!rows.length) return { userId: u.id, decision: null };
  // Under-age users are blocked by the same engine inside runUnderwriting.
  const r = await runUnderwriting(tx, u.id);
  return { userId: u.id, decision: r.decision.decision };
}

async function demoUser(tx: Tx, userId: string) {
  const [u] = await tx.select().from(users).where(eq(users.id, userId));
  if (!u) throw new UserError("User not found.", 404);
  return u;
}

/** Move one user's clock forward and replay every day in between through the daily job. */
export async function timeTravel(tx: Tx, actor: string, userId: string, to: { days?: number; cycles?: number; dueDate?: boolean; dpd?: number }) {
  requireDemo();
  const c = await getConfig(tx);
  const u = await demoUser(tx, userId);
  const now = await todayFor(tx, userId);
  let target = now;
  if (to.days) target = addDays(now, to.days);
  else if (to.cycles) target = addDays(now, to.cycles * c.cycle_length_days);
  else if (to.dueDate || to.dpd !== undefined) {
    const line = await getLine(tx, userId);
    if (!line) throw new UserError("This user has no line yet.");
    const cys = await tx.select().from(cycles).where(eq(cycles.lineId, line.id)).orderBy(asc(cycles.n));
    const bill = cys.find((x) => x.status === "billed" && unpaidOf(x) > 0) ?? cys.find((x) => x.status === "open");
    if (!bill) throw new UserError("No bill to jump to.");
    target = addDays(bill.dueDate, to.dpd ?? 0);
  }
  if (target < now) throw new UserError("Time travel only goes forward.");
  await tx.update(users).set({ clockOffsetDays: u.clockOffsetDays + daysBetween(now, target) }).where(eq(users.id, userId));
  const days = await processLine(tx, userId, target);
  await audit(tx, actor, "time_travel", `users:${userId}`, { today: now }, { today: target, daysProcessed: days });
  return { from: now, to: target, daysProcessed: days };
}

export async function setForceAutopayFail(tx: Tx, actor: string, userId: string, on: boolean) {
  requireDemo();
  const line = await getLine(tx, userId);
  if (!line) throw new UserError("This user has no line yet.");
  await tx.update(creditLines).set({ forceAutopayFail: on }).where(eq(creditLines.id, line.id));
  await audit(tx, actor, "demo_force_autopay_fail", `credit_lines:${line.id}`, null, { on });
}

export async function markPaid(tx: Tx, actor: string, userId: string) {
  requireDemo();
  await audit(tx, actor, "demo_mark_paid", `users:${userId}`, null, null);
  return repayAll(tx, userId, "manual");
}

export async function injectCohortDpd(tx: Tx, actor: string, cohort: string, pctPoints: number) {
  requireDemo();
  await tx
    .insert(cohortFlags)
    .values({ cohort, injectedDpdPct: pctPoints })
    .onConflictDoUpdate({ target: cohortFlags.cohort, set: { injectedDpdPct: pctPoints } });
  await audit(tx, actor, "demo_inject_dpd", `cohort:${cohort}`, null, { pctPoints });
  return recomputeBrakes(tx);
}

/** Deletes ONLY users created by "Create test user" (is_demo), and resets injected DPD. */
export async function resetDemo(tx: Tx, actor: string) {
  requireDemo();
  const gone = await tx.delete(users).where(eq(users.isDemo, true)).returning({ id: users.id });
  await tx.update(cohortFlags).set({ injectedDpdPct: 0 });
  // Real users' clocks are left alone: rewinding would put their processed days in the future.
  await audit(tx, actor, "demo_reset", "users", null, { deleted: gone.length });
  await recomputeBrakes(tx);
  return { deleted: gone.length };
}

export async function decisionsFor(tx: Tx, userId: string) {
  return tx.select().from(underwritingDecisions).where(eq(underwritingDecisions.userId, userId)).orderBy(desc(underwritingDecisions.computedAt));
}
