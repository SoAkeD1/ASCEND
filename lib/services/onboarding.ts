import { and, desc, eq, max } from "drizzle-orm";
import type { Tx } from "../db";
import {
  bureauChecks,
  consents,
  creditLines,
  cycles,
  inflowTxns,
  kfsDocuments,
  kycRecords,
  statementUploads,
  underwritingDecisions,
  users,
} from "../db/schema";
import { getConfig } from "../config";
import { todayFor } from "../clock";
import { addDays } from "../engine/dates";
import { analyseInflow, manualEntriesToTxns } from "../engine/inflow";
import { parseStatementCsv } from "../engine/statementCsv";
import { ageCheck, underwrite, type Decision } from "../engine/underwriting";
import { chooseLimit, computeOffer } from "../engine/limit";
import { buildKfs } from "../engine/kfs";
import { cycleWindow, dueDayFromPayday } from "../engine/cycle";
import type { BureauStatus } from "../engine/types";
import { BUREAU_SANDBOX_LABEL, sandboxKyc } from "../providers/sandbox";
import { audit, brakeFor, getLine, getUser, latestDecision, UserError } from "./common";

export const CONSENT_PURPOSES = {
  kyc: "Confirm you are who you say you are (PAN and Aadhaar). We keep only the last 4 digits.",
  aa: "Read your bank statement to see your monthly money coming in. This sets your limit.",
  bureau: "Check whether you have an unpaid loan today. Used only for this decision.",
  family_share: "Let someone you choose see your on-time status and streak. Never your spending.",
} as const;
export type ConsentType = keyof typeof CONSENT_PURPOSES;

const actor = (userId: string) => `user:${userId}`;

// ---------- where should this user be? ----------
export type Step =
  | "profile"
  | "age_block"
  | "kyc"
  | "enrolment"
  | "consent"
  | "bureau"
  | "cashflow"
  | "builder"
  | "limit"
  | "ladder"
  | "autopay"
  | "home";

export async function nextStep(tx: Tx, userId: string): Promise<Step> {
  const u = await getUser(tx, userId);
  const line = await getLine(tx, userId);
  if (line && line.status !== "pending") return "home";
  const d = await latestDecision(tx, userId);
  if (d?.decision === "age_block") return d.recheckAt && (await todayFor(tx, userId)) >= d.recheckAt ? "profile" : "age_block";
  if (!u.dob || !u.fullName) return "profile";
  const [kyc] = await tx.select().from(kycRecords).where(eq(kycRecords.userId, userId));
  if (!kyc) return "kyc";
  if (!u.enrolmentVerified) return "enrolment";
  const c = await tx.select().from(consents).where(eq(consents.userId, userId));
  const on = (t: string) => c.some((x) => x.type === t && x.granted);
  if (!on("kyc") || !on("aa") || !on("bureau")) return "consent";
  const [b] = await tx.select().from(bureauChecks).where(eq(bureauChecks.userId, userId)).limit(1);
  if (!b) return "bureau";
  if (!d) return "cashflow";
  if (d.decision === "builder") return "builder";
  if (!line) return "limit";
  if (!line.kfsAcceptedAt) return "limit";
  return "ladder"; // the ladder preview leads on to the AutoPay step
}

// ---------- profile + age ----------
export async function saveProfile(tx: Tx, userId: string, input: { fullName: string; dob: string }) {
  const c = await getConfig(tx);
  const today = await todayFor(tx, userId);
  await tx.update(users).set({ fullName: input.fullName.trim(), dob: input.dob }).where(eq(users.id, userId));
  const blocked = ageCheck(input.dob, today, c);
  if (blocked) {
    await saveDecision(tx, userId, blocked, today, null);
    // Keep nothing they typed: the decision row holds only the come-back date.
    await tx.update(users).set({ fullName: null, dob: null }).where(eq(users.id, userId));
    return { blocked: true as const, comeBackOn: blocked.recheckAt, age: blocked.actualValue, minAge: c.min_age };
  }
  // A birthday that has now passed can lift an earlier age block.
  await tx.delete(underwritingDecisions).where(and(eq(underwritingDecisions.userId, userId), eq(underwritingDecisions.decision, "age_block")));
  return { blocked: false as const };
}

// ---------- KYC ----------
export async function saveKyc(tx: Tx, userId: string, input: { pan: string; aadhaar: string }) {
  const r = await sandboxKyc.verify(input.pan, input.aadhaar);
  if (!r.ok) throw new UserError(r.reason);
  await tx
    .insert(kycRecords)
    .values({ userId, panLast4: r.panLast4, aadhaarLast4: r.aadhaarLast4, provider: sandboxKyc.name })
    .onConflictDoUpdate({ target: kycRecords.userId, set: { panLast4: r.panLast4, aadhaarLast4: r.aadhaarLast4, verifiedAt: new Date() } });
  await audit(tx, actor(userId), "kyc_verified", `kyc_records:${userId}`, null, { panLast4: r.panLast4, aadhaarLast4: r.aadhaarLast4 });
  return { panLast4: r.panLast4, aadhaarLast4: r.aadhaarLast4 };
}

// ---------- enrolment ----------
export async function saveEnrolment(
  tx: Tx,
  userId: string,
  input: { college: string; course: string; year: number; method: "id_upload" | "college_email" },
) {
  await tx
    .update(users)
    .set({ college: input.college, course: input.course, year: input.year, enrolmentVerified: true, enrolmentMethod: `${input.method} (sandbox)` })
    .where(eq(users.id, userId));
}

// ---------- consents ----------
export async function setConsent(tx: Tx, userId: string, type: ConsentType, granted: boolean) {
  const [before] = await tx.select().from(consents).where(and(eq(consents.userId, userId), eq(consents.type, type)));
  const now = new Date();
  const values = {
    granted,
    purpose: CONSENT_PURPOSES[type],
    grantedAt: granted ? now : (before?.grantedAt ?? null),
    revokedAt: granted ? null : now,
  };
  await tx.insert(consents).values({ userId, type, ...values }).onConflictDoUpdate({ target: [consents.userId, consents.type], set: values });
  await audit(tx, actor(userId), granted ? "consent_granted" : "consent_withdrawn", `consents:${type}`, before ? { granted: before.granted } : null, { granted });
}

export async function getConsents(tx: Tx, userId: string) {
  const rows = await tx.select().from(consents).where(eq(consents.userId, userId));
  return (Object.keys(CONSENT_PURPOSES) as ConsentType[]).map((type) => {
    const r = rows.find((x) => x.type === type);
    return { type, purpose: CONSENT_PURPOSES[type], granted: r?.granted ?? false, grantedAt: r?.grantedAt ?? null, revokedAt: r?.revokedAt ?? null };
  });
}

async function requireConsent(tx: Tx, userId: string, type: ConsentType) {
  const [c] = await tx.select().from(consents).where(and(eq(consents.userId, userId), eq(consents.type, type)));
  if (!c?.granted) throw new UserError(`Turn on the "${type.toUpperCase()}" consent first.`);
}

// ---------- Gate 1: bureau (self-declared in the sandbox) ----------
export async function saveBureau(tx: Tx, userId: string, input: { status: BureauStatus; overdueAmount: number }) {
  await requireConsent(tx, userId, "bureau");
  const overdueAmount = input.status === "active_default" ? input.overdueAmount : 0;
  await tx.insert(bureauChecks).values({ userId, status: input.status, overdueAmount, sourceLabel: BUREAU_SANDBOX_LABEL });
}

export async function latestBureau(tx: Tx, userId: string) {
  const [b] = await tx.select().from(bureauChecks).where(eq(bureauChecks.userId, userId)).orderBy(desc(bureauChecks.checkedAt)).limit(1);
  return b ?? null;
}

// ---------- Gate 2: cash flow ----------
export async function uploadStatement(tx: Tx, userId: string, input: { filename: string; text: string; keepFile: boolean }) {
  await requireConsent(tx, userId, "aa");
  const c = await getConfig(tx);
  const { txns, errors } = parseStatementCsv(input.text, c);
  if (txns.length === 0) return { imported: 0, errors };
  await tx.delete(inflowTxns).where(and(eq(inflowTxns.userId, userId), eq(inflowTxns.source, "csv")));
  await tx.insert(inflowTxns).values(txns.map((t) => ({ ...t, userId })));
  // The raw file is kept only if the user asked; otherwise only the parsed rows remain.
  await tx.insert(statementUploads).values({ userId, filename: input.filename, content: input.keepFile ? input.text : null, rows: txns.length });
  return { imported: txns.length, errors };
}

export async function saveManualInflow(tx: Tx, userId: string, entries: { month: string; amount: number }[]) {
  await requireConsent(tx, userId, "aa");
  await tx.delete(inflowTxns).where(and(eq(inflowTxns.userId, userId), eq(inflowTxns.source, "manual")));
  if (entries.length) await tx.insert(inflowTxns).values(manualEntriesToTxns(entries).map((t) => ({ ...t, userId })));
}

export async function inflowSummary(tx: Tx, userId: string) {
  const rows = await tx.select().from(inflowTxns).where(eq(inflowTxns.userId, userId));
  return analyseInflow(rows.map((r) => ({ date: r.date, amount: r.amount, description: r.description, kind: r.kind, source: r.source })));
}

async function saveDecision(tx: Tx, userId: string, d: Decision, today: string, inflow: Awaited<ReturnType<typeof inflowSummary>> | null) {
  await tx.insert(underwritingDecisions).values({
    userId,
    gate1Result: d.gate1Pass,
    avgInflow: inflow?.avgMonthlyInflow ?? null,
    historyMonths: inflow?.historyMonths ?? null,
    lastBounceDate: inflow?.lastBounceDate ?? null,
    payday: inflow?.payday ?? null,
    gate2InflowOk: d.gate2?.inflowOk ?? null,
    gate2HistoryOk: d.gate2?.historyOk ?? null,
    gate2BounceOk: d.gate2?.bounceOk ?? null,
    decision: d.decision,
    reasonKey: d.reasonKey,
    actualValue: d.actualValue,
    requiredValue: d.requiredValue,
    offeredLimit: d.offer?.offer ?? null,
    offerRaw: d.offer?.raw ?? null,
    offerClampedBy: d.offer?.clampedBy ?? null,
    computedOn: today,
    recheckAt: d.recheckAt,
  });
  await audit(tx, actor(userId), "underwriting_decision", `users:${userId}`, null, { decision: d.decision, reason: d.reasonKey, offer: d.offer?.offer ?? null });
}

/** Run every gate on the user's own data and store the decision. Can be re-run any time. */
export async function runUnderwriting(tx: Tx, userId: string) {
  await requireConsent(tx, userId, "aa");
  await requireConsent(tx, userId, "bureau");
  const c = await getConfig(tx);
  const u = await getUser(tx, userId);
  if (!u.dob) throw new UserError("Add your date of birth first.");
  const bureau = await latestBureau(tx, userId);
  if (!bureau) throw new UserError("Complete the bureau step first.");
  const inflow = await inflowSummary(tx, userId);
  // Gate 1 runs before Gate 2, so an active default is decided without needing a statement.
  if (inflow.historyMonths === 0 && bureau.status !== "active_default") throw new UserError("Upload a statement or add monthly amounts first.");
  const today = await todayFor(tx, userId);
  const d = underwrite({ dob: u.dob, today, bureau: { status: bureau.status, overdueAmount: bureau.overdueAmount }, inflow }, c);
  await saveDecision(tx, userId, d, today, inflow);
  return { decision: d, inflow };
}

// ---------- limit + KFS ----------
export async function chooseUserLimit(tx: Tx, userId: string, requested: number) {
  const c = await getConfig(tx);
  const u = await getUser(tx, userId);
  const d = await latestDecision(tx, userId);
  if (d?.decision !== "approved" || d.offeredLimit === null || d.avgInflow === null) throw new UserError("You need an approved decision first.");
  if ((await brakeFor(tx, u.cohort)) !== "none") {
    throw new UserError("New credit lines for your sign-up month are paused for now by our risk controls. We will let you know when they reopen.", 409);
  }
  const existing = await getLine(tx, userId);
  if (existing && existing.status !== "pending") throw new UserError("Your line is already set up.");
  let chosen: number;
  try {
    chosen = chooseLimit(requested, d.offeredLimit, c);
  } catch (e) {
    throw new UserError((e as Error).message);
  }
  const values = { offeredLimit: d.offeredLimit, chosenLimit: chosen, baseLimit: chosen, currentLimit: chosen, status: "pending" as const, payday: d.payday };
  if (existing) await tx.update(creditLines).set({ ...values, kfsAcceptedAt: null, kfsVersion: null }).where(eq(creditLines.id, existing.id));
  else await tx.insert(creditLines).values({ userId, ...values });
  await audit(tx, actor(userId), "limit_chosen", `credit_lines:${userId}`, existing ? { chosen: existing.chosenLimit } : null, { chosen, offered: d.offeredLimit });
  return generateKfs(tx, userId);
}

export async function generateKfs(tx: Tx, userId: string) {
  const c = await getConfig(tx);
  const line = await getLine(tx, userId);
  const d = await latestDecision(tx, userId);
  if (!line || !d?.avgInflow) throw new UserError("Choose your limit first.");
  const [{ v }] = await tx.select({ v: max(kfsDocuments.version) }).from(kfsDocuments).where(eq(kfsDocuments.userId, userId));
  const version = (v ?? 0) + 1;
  const today = await todayFor(tx, userId);
  const kfs = buildKfs(
    {
      version,
      today,
      chosenLimit: line.chosenLimit,
      offer: computeOffer(d.avgInflow, c),
      avgMonthlyInflow: d.avgInflow,
      consents: (await getConsents(tx, userId)).map(({ type, purpose, granted }) => ({ type, purpose, granted })),
    },
    c,
  );
  await tx.insert(kfsDocuments).values({ userId, version, jsonSnapshot: kfs });
  return kfs;
}

export async function latestKfs(tx: Tx, userId: string) {
  const [k] = await tx.select().from(kfsDocuments).where(eq(kfsDocuments.userId, userId)).orderBy(desc(kfsDocuments.version)).limit(1);
  return k ?? null;
}

export async function acceptKfs(tx: Tx, userId: string, version: number) {
  const k = await latestKfs(tx, userId);
  if (!k || k.version !== version) throw new UserError("This KFS is out of date. Please read the latest version.", 409);
  const line = await getLine(tx, userId);
  if (!line) throw new UserError("Choose your limit first.");
  const now = new Date();
  await tx.update(kfsDocuments).set({ acceptedAt: now }).where(eq(kfsDocuments.id, k.id));
  await tx.update(creditLines).set({ kfsVersion: version, kfsAcceptedAt: now }).where(eq(creditLines.id, line.id));
  await audit(tx, actor(userId), "kfs_accepted", `kfs_documents:${k.id}`, null, { version });
}

// ---------- AutoPay + activation ----------
export async function suggestedDueDay(tx: Tx, userId: string) {
  const c = await getConfig(tx);
  const line = await getLine(tx, userId);
  return line?.payday ? dueDayFromPayday(line.payday, c) : null;
}

export async function activateLine(tx: Tx, userId: string, input: { autopayOn: boolean; dueDay: number }) {
  const c = await getConfig(tx);
  const line = await getLine(tx, userId);
  if (!line?.kfsAcceptedAt) throw new UserError("Accept the Key Fact Statement first.");
  if (line.status !== "pending") throw new UserError("Your line is already active.");
  const today = await todayFor(tx, userId);
  const w = cycleWindow(today, input.dueDay, c);
  await tx
    .update(creditLines)
    .set({ autopayOn: input.autopayOn, dueDay: input.dueDay, status: "cooling_off", coolingOffUntil: addDays(today, c.cooling_off_days), lastProcessedOn: today })
    .where(eq(creditLines.id, line.id));
  await tx.insert(cycles).values({ userId, lineId: line.id, n: 1, startDate: w.start, endDate: w.end, dueDate: w.due });
  await audit(tx, actor(userId), "line_activated", `credit_lines:${line.id}`, { status: line.status }, { status: "cooling_off", autopayOn: input.autopayOn, dueDay: input.dueDay });
}
