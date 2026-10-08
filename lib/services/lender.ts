import { desc, eq, sql } from "drizzle-orm";
import type { Tx } from "../db";
import { cohortFlags, creditLines, cycles, dlgLedger, revenueLedger, underwritingDecisions, users } from "../db/schema";
import { getConfig } from "../config";
import { todayFor } from "../clock";
import { daysBetween } from "../engine/dates";
import { dpdPct } from "../engine/riskBrake";
import { REVENUE_TYPES } from "../engine/revenue";
import { historyOf, unpaidOf } from "./common";

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100 * 100) / 100 : null);

/** Every number on the lender dashboard, computed from rows. Nothing is stored pre-aggregated. */
export async function lenderMetrics(tx: Tx) {
  const c = await getConfig(tx);
  const people = await tx.select({ id: users.id, cohort: users.cohort, role: users.role }).from(users);
  const borrowers = people.filter((p) => p.role === "user");
  const lines = await tx.select().from(creditLines);
  const allCycles = await tx.select().from(cycles);
  const live = lines.filter((l) => l.status !== "pending");

  // Approval funnel, from each user's latest decision.
  const decisions = await tx.select().from(underwritingDecisions).orderBy(desc(underwritingDecisions.computedAt));
  const latest = new Map<string, (typeof decisions)[number]>();
  for (const d of decisions) if (!latest.has(d.userId)) latest.set(d.userId, d);
  const ds = [...latest.values()];
  const funnel = {
    signups: borrowers.length,
    decided: ds.length,
    gate1Pass: ds.filter((d) => d.gate1Result === true).length,
    gate2Pass: ds.filter((d) => d.decision === "approved").length,
    approved: ds.filter((d) => d.decision === "approved").length,
    builder: ds.filter((d) => d.decision === "builder").length,
    ageBlocked: ds.filter((d) => d.decision === "age_block").length,
    linesOpened: live.length,
  };

  // Per-line facts.
  const cohortOf = new Map(people.map((p) => [p.id, p.cohort]));
  type Cycle = (typeof allCycles)[number];
  const facts: { line: (typeof lines)[number]; cohort: string; outstanding: number; dpd: number; record: boolean[]; firstBill: Cycle | null }[] = [];
  for (const l of live) {
    const cys = allCycles.filter((x) => x.lineId === l.id).sort((a, b) => a.n - b.n);
    const today = await todayFor(tx, l.userId);
    const unpaidBills = cys.filter((x) => x.status === "billed" && unpaidOf(x) > 0);
    facts.push({
      line: l,
      cohort: cohortOf.get(l.userId)!,
      outstanding: cys.filter((x) => x.status !== "settled").reduce((s, x) => s + unpaidOf(x), 0),
      dpd: Math.max(0, ...unpaidBills.map((x) => daysBetween(x.dueDate, today))),
      record: historyOf(cys, today),
      firstBill: cys.find((x) => x.status !== "open" && (x.statementAmount ?? 0) > 0) ?? null,
    });
  }

  // Credit-ready: at least first_score_cycle cycles on the repayment record, every one on time.
  const scored = facts.filter((f) => f.record.length >= c.first_score_cycle);
  const creditReady = scored.filter((f) => f.record.every(Boolean));
  const withFirstBill = facts.filter((f) => f.firstBill);
  const fpd = withFirstBill.filter((f) => f.firstBill!.dpdMax > c.grace_days);

  const cohorts = [...new Set(facts.map((f) => f.cohort))].sort();
  const flags = await tx.select().from(cohortFlags);
  const dlgRows = await tx.select().from(dlgLedger);
  const byCohort = cohorts.map((cohort) => {
    const fs = facts.filter((f) => f.cohort === cohort);
    const book = fs.reduce((s, f) => s + f.line.currentLimit, 0);
    const dlgUsed = dlgRows.filter((d) => d.cohort === cohort).reduce((s, d) => s + d.amountCovered, 0);
    const flag = flags.find((f) => f.cohort === cohort);
    return {
      cohort,
      lines: fs.length,
      outstanding: fs.reduce((s, f) => s + f.outstanding, 0),
      dpd30Pct: dpdPct(fs, c),
      injectedPct: flag?.injectedDpdPct ?? 0,
      brake: flag?.brakeState ?? "none",
      book,
      dlgUsed,
      dlgCap: Math.floor((book * c.dlg_cap_pct) / 100),
    };
  });

  const revRows = await tx.select({ type: revenueLedger.type, total: sql<string>`sum(${revenueLedger.amount})` }).from(revenueLedger).groupBy(revenueLedger.type);
  const revenue = REVENUE_TYPES.map((type) => ({ type, amount: Number(revRows.find((r) => r.type === type)?.total ?? 0) }));

  return {
    rules: {
      firstScoreCycle: c.first_score_cycle,
      bureauReportDpd: c.bureau_report_dpd,
      graceDays: c.grace_days,
      dpdTargetPct: c.dpd_target_pct,
      brakePct: c.brake_pct,
      stopPct: c.stop_pct,
      dlgCapPct: c.dlg_cap_pct,
      partner: c.partner_bank_name,
    },
    creditReady: { rate: pct(creditReady.length, scored.length), ready: creditReady.length, eligible: scored.length },
    dpd30: { overallPct: dpdPct(facts, c), outstanding: facts.reduce((s, f) => s + f.outstanding, 0) },
    firstPaymentDefault: { rate: pct(fpd.length, withFirstBill.length), count: fpd.length, of: withFirstBill.length },
    autopay: { rate: pct(live.filter((l) => l.autopayOn).length, live.length), on: live.filter((l) => l.autopayOn).length, of: live.length },
    statusMix: Object.fromEntries(["cooling_off", "active", "paused", "frozen", "recovery", "graduated", "closed"].map((s) => [s, live.filter((l) => l.status === s).length])),
    funnel,
    byCohort,
    revenue,
    lateFeeRevenue: 0 as const,
  };
}

export async function cohortBrake(tx: Tx, cohort: string) {
  const [f] = await tx.select().from(cohortFlags).where(eq(cohortFlags.cohort, cohort));
  return f ?? null;
}
