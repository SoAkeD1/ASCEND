import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Tx } from "../db";
import { auditLog, cohortFlags, creditLines, cycles, moments, notifications, underwritingDecisions, users } from "../db/schema";
import type { IsoDate } from "../engine/dates";
import type { MomentHit } from "../engine/moments";
import { repaymentHistory, type BrakeState } from "../engine/ladder";

export class UserError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function audit(tx: Tx, actor: string, action: string, entity: string, before: unknown, after: unknown) {
  await tx.insert(auditLog).values({ actor, action, entity, before: before ?? null, after: after ?? null });
}

/** NotificationProvider (in-app). Messages go ONLY to the user themselves, never to anyone else. */
export async function notify(tx: Tx, userId: string, template: string, payload: Record<string, unknown>, today: IsoDate) {
  await tx.insert(notifications).values({ userId, channel: "in_app", template, payload, sentOn: today });
}

export async function recordMoments(tx: Tx, userId: string, hits: MomentHit[], payload: Record<string, unknown>) {
  for (const h of hits) {
    await tx.insert(moments).values({ userId, trigger: h.trigger, key: h.key, payload }).onConflictDoNothing();
  }
}

export async function shownMomentKeys(tx: Tx, userId: string): Promise<Set<string>> {
  const rows = await tx.select({ key: moments.key }).from(moments).where(eq(moments.userId, userId));
  return new Set(rows.map((r) => r.key));
}

export async function getUser(tx: Tx, userId: string) {
  const [u] = await tx.select().from(users).where(eq(users.id, userId));
  if (!u || u.deletedAt) throw new UserError("Account not found.", 404);
  return u;
}

export async function getLine(tx: Tx, userId: string) {
  const [l] = await tx.select().from(creditLines).where(eq(creditLines.userId, userId));
  return l ?? null;
}

export async function latestDecision(tx: Tx, userId: string) {
  const [d] = await tx.select().from(underwritingDecisions).where(eq(underwritingDecisions.userId, userId)).orderBy(desc(underwritingDecisions.computedAt)).limit(1);
  return d ?? null;
}

export async function lineCycles(tx: Tx, lineId: string) {
  return tx.select().from(cycles).where(eq(cycles.lineId, lineId)).orderBy(asc(cycles.n));
}

export async function openCycle(tx: Tx, lineId: string) {
  const [c] = await tx.select().from(cycles).where(and(eq(cycles.lineId, lineId), eq(cycles.status, "open")));
  return c ?? null;
}

export async function billedCycles(tx: Tx, lineId: string) {
  return tx.select().from(cycles).where(and(eq(cycles.lineId, lineId), inArray(cycles.status, ["billed"]))).orderBy(asc(cycles.n));
}

export type Cycle = typeof cycles.$inferSelect;
export type Line = typeof creditLines.$inferSelect;

export const unpaidOf = (c: Cycle) => Math.max(0, (c.statementAmount ?? c.spendTotal) - c.paidAmount);

/** The user's repayment record from their cycle rows (see repaymentHistory for the rules). */
export const historyOf = (all: Pick<Cycle, "n" | "status" | "statementAmount" | "onTime" | "dueDate">[], today: IsoDate) =>
  repaymentHistory(
    all.map((c) => ({ n: c.n, status: c.status, statement: c.statementAmount, onTime: c.onTime, due: c.dueDate })),
    today,
  );

/** Everything owed right now: unpaid statements plus this cycle's spending so far. */
export function outstandingOf(all: Cycle[]): number {
  return all.filter((c) => c.status !== "settled").reduce((s, c) => s + unpaidOf(c), 0);
}

export async function brakeFor(tx: Tx, cohort: string): Promise<BrakeState> {
  const [f] = await tx.select().from(cohortFlags).where(eq(cohortFlags.cohort, cohort));
  return f?.brakeState ?? "none";
}
