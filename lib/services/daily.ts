import { and, desc, eq, inArray, ne, sum } from "drizzle-orm";
import type { Tx } from "../db";
import { withActor, SYSTEM } from "../db/actor";
import { cohortFlags, creditLines, cycles, dlgLedger, repayments, slipEvents, underwritingDecisions, users } from "../db/schema";
import { runUnderwriting } from "./onboarding";
import { getConfig } from "../config";
import type { Config } from "../config/schema";
import { todayFor } from "../clock";
import { addDays, daysBetween, type IsoDate } from "../engine/dates";
import { cycleWindow } from "../engine/cycle";
import { isWeeklyNoticeDay, slipState, STEP_NAMES, type SlipStep } from "../engine/slipLadder";
import { momentsToFire } from "../engine/moments";
import { dlgCover, dpdPct, nextBrakeState } from "../engine/riskBrake";
import { sandboxAutopay } from "../providers/sandbox";
import { audit, billedCycles, getLine, historyOf, notify, openCycle, recordMoments, shownMomentKeys, unpaidOf, type Cycle, type Line } from "./common";
import { activeHardshipPlan, afterRepayment, settleCycle } from "./line";

const SEVERITY: Record<string, number> = { active: 0, cooling_off: 0, graduated: 0, paused: 1, frozen: 2, recovery: 3 };

/** Bring one user's line up to date, one day at a time, from the day after it was last processed. */
export async function processLine(tx: Tx, userId: string, until?: IsoDate) {
  const c = await getConfig(tx);
  const target = until ?? (await todayFor(tx, userId));
  const line = await getLine(tx, userId);
  if (!line || line.status === "pending" || line.status === "closed" || !line.lastProcessedOn) return 0;
  let d = addDays(line.lastProcessedOn, 1);
  let days = 0;
  while (d <= target) {
    await processDay(tx, userId, d, c);
    d = addDays(d, 1);
    days++;
  }
  return days;
}

async function processDay(tx: Tx, userId: string, today: IsoDate, c: Config) {
  let line = (await getLine(tx, userId))!;

  // 1. Cooling-off ends.
  if (line.status === "cooling_off" && line.coolingOffUntil && today > line.coolingOffUntil) {
    await tx.update(creditLines).set({ status: "active" }).where(eq(creditLines.id, line.id));
    line = { ...line, status: "active" };
  }

  // 2. The open cycle closes: fix the statement and open the next cycle.
  const open = await openCycle(tx, line.id);
  if (open && today >= open.endDate) {
    const statement = open.spendTotal;
    await tx.update(cycles).set({ status: "billed", statementAmount: statement }).where(eq(cycles.id, open.id));
    if (line.status !== "graduated" && line.status !== "closed" && line.dueDay) {
      const w = cycleWindow(open.endDate, line.dueDay, c);
      await tx.insert(cycles).values({ userId, lineId: line.id, n: open.n + 1, startDate: w.start, endDate: w.end, dueDate: w.due });
    }
    // Cycles on the repayment record so far (the rule the score journey uses).
    const closed = historyOf(await tx.select().from(cycles).where(eq(cycles.lineId, line.id)), today).length;
    const hits = momentsToFire(
      { totalSpends: 0, utilisationPct: 0, cycleN: open.n, today, unpaidDue: null, closedCycles: closed, justClosedCycle: open.n, justRaisedTo: null },
      await shownMomentKeys(tx, userId),
      c,
    ).filter((h) => h.trigger === "cycle_closed" || h.trigger === "first_score");
    await recordMoments(tx, userId, hits, { cycle: open.n, statement, due: open.dueDate, spend: open.spendTotal, closedCycles: closed });
    if (statement > 0) await notify(tx, userId, "statement_ready", { cycle: open.n, amount: statement, due: open.dueDate }, today);
    // Paid early (or nothing spent): settle straight away.
    if (open.paidAmount >= statement) {
      await settleCycle(tx, line, { ...open, status: "billed", statementAmount: statement }, open.paidAt ?? today, c);
      await afterRepayment(tx, userId, today, c);
      line = (await getLine(tx, userId))!;
    }
  }

  // 3. The slip ladder for every bill still unpaid.
  let worst = 0;
  for (const cy of await billedCycles(tx, line.id)) {
    const unpaid = unpaidOf(cy);
    const s = slipState({ today, due: cy.dueDate, unpaid }, c);
    if (s.step === 0) continue;

    const isPayday = line.payday !== null && Number(today.slice(8)) === line.payday;
    if (line.autopayOn && (s.step === 2 || ((s.step === 3 || s.step === 4) && isPayday))) {
      if (await attemptAutopay(tx, line, cy, unpaid, today, c, s.step)) {
        line = (await getLine(tx, userId))!;
        continue;
      }
    }

    if (s.step > cy.slipStep) await enterStep(tx, line, cy, s.step, s.dpd, unpaid, today, c);
    const patch: Partial<Cycle> = {};
    if (s.dpd > cy.dpdMax) patch.dpdMax = s.dpd;
    if (s.reported && !cy.reported) {
      patch.reported = true;
      await notify(tx, userId, "bureau_reported", { amount: unpaid, due: cy.dueDate, dpd: s.dpd }, today);
    }
    if (Object.keys(patch).length) await tx.update(cycles).set(patch).where(eq(cycles.id, cy.id));
    if (isWeeklyNoticeDay(s, c) && s.step === cy.slipStep) {
      await notify(tx, userId, "weekly_notice", { amount: unpaid, due: cy.dueDate, dpd: s.dpd, reportOn: addDays(cy.dueDate, c.bureau_report_dpd) }, today);
    }
    if (s.dlgInvoke) await invokeDlg(tx, line, unpaid, today, c);
    if (s.lineStatus) worst = Math.max(worst, SEVERITY[s.lineStatus]);
  }

  // 4. The line takes the status of its worst unpaid bill. A running hardship plan keeps it frozen.
  const target = Object.keys(SEVERITY).find((k) => SEVERITY[k] === worst && k !== "active" && k !== "cooling_off" && k !== "graduated");
  if (target && SEVERITY[line.status] < worst && !(await activeHardshipPlan(tx, line.id))) {
    await tx.update(creditLines).set({ status: target as Line["status"] }).where(eq(creditLines.id, line.id));
    await audit(tx, "system", "slip_status", `credit_lines:${line.id}`, { status: line.status }, { status: target });
  }
  await tx.update(creditLines).set({ lastProcessedOn: today }).where(eq(creditLines.id, line.id));
}

async function attemptAutopay(tx: Tx, line: Line, cy: Cycle, unpaid: number, today: IsoDate, c: Config, step: number) {
  const r = await sandboxAutopay.debit(unpaid, { forceFail: line.forceAutopayFail });
  await tx.insert(repayments).values({ userId: line.userId, cycleId: cy.id, amount: unpaid, method: "autopay", status: r.ok ? "success" : "failed", paidOn: today });
  if (!r.ok) {
    await notify(tx, line.userId, "autopay_failed", { amount: unpaid, due: cy.dueDate, retryOnPayday: line.payday }, today);
    return false;
  }
  await tx.update(cycles).set({ paidAmount: cy.paidAmount + unpaid, paidAt: today }).where(eq(cycles.id, cy.id));
  await settleCycle(tx, line, { ...cy, paidAmount: cy.paidAmount + unpaid }, today, c);
  await notify(tx, line.userId, "autopay_success", { amount: unpaid, retry: step !== 2 }, today);
  await afterRepayment(tx, line.userId, today, c);
  return true;
}

async function enterStep(tx: Tx, line: Line, cy: Cycle, step: SlipStep, dpd: number, unpaid: number, today: IsoDate, c: Config) {
  const actions: Record<number, Record<string, unknown>> = {
    1: { notify: "reminder", amount: unpaid, due: cy.dueDate },
    2: { autopay: line.autopayOn ? "failed" : "off", amount: unpaid },
    3: { line: "paused", lateFee: c.late_fee, graceEnds: addDays(cy.dueDate, c.grace_days) },
    4: { notify: "user_only_weekly", reportOn: addDays(cy.dueDate, c.bureau_report_dpd) },
    5: { line: "frozen", hardshipOffered: true, principal: unpaid },
    6: { line: "recovery", partnerHandoff: c.partner_bank_name, thirdPartyContact: false },
  };
  const inserted = await tx
    .insert(slipEvents)
    .values({ userId: line.userId, lineId: line.id, cycleId: cy.id, step, enteredOn: today, actionsJson: { dpd, ...actions[step] } })
    .onConflictDoNothing()
    .returning({ id: slipEvents.id });
  await tx.update(cycles).set({ slipStep: step }).where(eq(cycles.id, cy.id));
  if (inserted.length === 0) return;
  await audit(tx, "system", "slip_step", `cycles:${cy.id}`, { step: cy.slipStep }, { step, name: STEP_NAMES[step], dpd });
  const template = ["", "due_reminder", "autopay_due", "grace", "reminders", "freeze_plan", "recovery"][step];
  if (step === 2 && line.autopayOn) return; // the autopay result has its own message
  await notify(tx, line.userId, template, { amount: unpaid, due: cy.dueDate, dpd, lateFee: c.late_fee }, today);
}

async function invokeDlg(tx: Tx, line: Line, unpaid: number, today: IsoDate, c: Config) {
  const [already] = await tx.select().from(dlgLedger).where(eq(dlgLedger.lineId, line.id));
  if (already) return;
  const [u] = await tx.select({ cohort: users.cohort }).from(users).where(eq(users.id, line.userId));
  const [book] = await tx
    .select({ total: sum(creditLines.currentLimit) })
    .from(creditLines)
    .innerJoin(users, eq(users.id, creditLines.userId))
    .where(eq(users.cohort, u.cohort));
  const [used] = await tx.select({ total: sum(dlgLedger.amountCovered) }).from(dlgLedger).where(eq(dlgLedger.cohort, u.cohort));
  const cover = dlgCover({ unpaid, cohortBook: Number(book.total ?? 0), usedSoFar: Number(used.total ?? 0) }, c);
  await tx.insert(dlgLedger).values({ userId: line.userId, cohort: u.cohort, lineId: line.id, amountCovered: cover, invokedOn: today });
  await audit(tx, "system", "dlg_invoked", `credit_lines:${line.id}`, null, { unpaid, cover });
}

/** Recompute 30+ DPD per cohort and move the brake. Runs in the daily cron and on demand. */
export async function recomputeBrakes(tx: Tx) {
  const c = await getConfig(tx);
  const rows = await tx
    .select({ line: creditLines, cohort: users.cohort, userId: users.id })
    .from(creditLines)
    .innerJoin(users, eq(users.id, creditLines.userId))
    .where(inArray(creditLines.status, ["cooling_off", "active", "paused", "frozen", "recovery", "graduated"]));
  const byCohort = new Map<string, { outstanding: number; dpd: number }[]>();
  for (const r of rows) {
    const today = await todayFor(tx, r.userId);
    const cys = await tx.select().from(cycles).where(and(eq(cycles.lineId, r.line.id), ne(cycles.status, "settled")));
    const outstanding = cys.reduce((s, x) => s + unpaidOf(x), 0);
    const dpd = Math.max(0, ...cys.filter((x) => x.status === "billed" && unpaidOf(x) > 0).map((x) => daysBetween(x.dueDate, today)));
    if (!byCohort.has(r.cohort)) byCohort.set(r.cohort, []);
    byCohort.get(r.cohort)!.push({ outstanding, dpd });
  }
  const flags = await tx.select().from(cohortFlags);
  const cohorts = new Set([...byCohort.keys(), ...flags.map((f) => f.cohort)]);
  const out: { cohort: string; pct: number; state: string }[] = [];
  for (const cohort of cohorts) {
    const prev = flags.find((f) => f.cohort === cohort);
    const pct = Math.round((dpdPct(byCohort.get(cohort) ?? [], c) + (prev?.injectedDpdPct ?? 0)) * 100) / 100;
    const state = nextBrakeState(pct, prev?.brakeState ?? "none", c);
    await tx
      .insert(cohortFlags)
      .values({ cohort, brakeState: state, dpdPct: pct })
      .onConflictDoUpdate({ target: cohortFlags.cohort, set: { brakeState: state, dpdPct: pct, updatedAt: new Date() } });
    if (state !== (prev?.brakeState ?? "none")) await audit(tx, "system", "risk_brake", `cohort:${cohort}`, { state: prev?.brakeState ?? "none" }, { state, pct });
    out.push({ cohort, pct, state });
  }
  return out;
}

/** The Vercel Cron entry point: every line, each in its own transaction, then the brakes. */
export async function runDailyAll() {
  const lines = await withActor(SYSTEM, (tx) =>
    tx.select({ userId: creditLines.userId }).from(creditLines).where(inArray(creditLines.status, ["cooling_off", "active", "paused", "frozen", "recovery", "graduated"])),
  );
  let processed = 0;
  for (const l of lines) {
    processed += await withActor(SYSTEM, (tx) => processLine(tx, l.userId));
  }
  const rechecked = await recheckBuilders();
  const brakes = await withActor(SYSTEM, (tx) => recomputeBrakes(tx));
  return { lines: lines.length, daysProcessed: processed, rechecked, brakes };
}

/** Builder path promise: on the re-check date, run the gates again on the user's latest data. */
export async function recheckBuilders() {
  const due = await withActor(SYSTEM, async (tx) => {
    const rows = await tx
      .select({ userId: underwritingDecisions.userId, recheckAt: underwritingDecisions.recheckAt, decision: underwritingDecisions.decision, at: underwritingDecisions.computedAt })
      .from(underwritingDecisions)
      .orderBy(desc(underwritingDecisions.computedAt));
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.userId)) latest.set(r.userId, r);
    const out: string[] = [];
    for (const r of latest.values()) {
      if (r.decision === "builder" && r.recheckAt && (await todayFor(tx, r.userId)) >= r.recheckAt) out.push(r.userId);
    }
    return out;
  });
  let n = 0;
  for (const userId of due) {
    try {
      await withActor(SYSTEM, (tx) => runUnderwriting(tx, userId));
      n++;
    } catch {
      // Consent withdrawn or data deleted: nothing to re-check. The user can still re-check by hand.
    }
  }
  return n;
}
