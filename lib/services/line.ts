import { and, asc, count, eq, sql } from "drizzle-orm";
import type { Tx } from "../db";
import { creditLines, cycles, hardshipPlans, ladderEvents, repayments, revenueLedger, rewards, transactions } from "../db/schema";
import { getConfig } from "../config";
import type { Config } from "../config/schema";
import { todayFor } from "../clock";
import { addDays, type IsoDate } from "../engine/dates";
import { checkSpend, isOnTime, utilisation } from "../engine/cycle";
import { cleanStreak, comebackLimit, comebackRestored, evaluateLadder, tierFor } from "../engine/ladder";
import { cashbackFor } from "../engine/rewards";
import { graduationFee, healthyAccountFee, interchangeOn } from "../engine/revenue";
import { momentsToFire } from "../engine/moments";
import { buildHardshipPlan } from "../engine/hardship";
import { sandboxUpi } from "../providers/sandbox";
import {
  audit,
  brakeFor,
  getLine,
  getUser,
  historyOf,
  latestDecision,
  lineCycles,
  notify,
  openCycle,
  outstandingOf,
  recordMoments,
  shownMomentKeys,
  unpaidOf,
  UserError,
  type Cycle,
  type Line,
} from "./common";

const actor = (userId: string) => `user:${userId}`;

export async function requireLine(tx: Tx, userId: string): Promise<Line> {
  const line = await getLine(tx, userId);
  if (!line || line.status === "pending") throw new UserError("Finish setting up your line first.", 409);
  return line;
}

export async function activeHardshipPlan(tx: Tx, lineId: string) {
  const [p] = await tx.select().from(hardshipPlans).where(and(eq(hardshipPlans.lineId, lineId), eq(hardshipPlans.status, "active")));
  return p ?? null;
}

export type Instalment = { n: number; amount: number; due: IsoDate };
const planRemaining = (p: typeof hardshipPlans.$inferSelect) =>
  (p.scheduleJson as Instalment[]).slice(p.paidInstalments).reduce((s, i) => s + i.amount, 0);

/** Total owed: unpaid statements, this cycle's spending, and any hardship plan balance. */
export async function lineOutstanding(tx: Tx, line: Line) {
  const all = await lineCycles(tx, line.id);
  const plan = await activeHardshipPlan(tx, line.id);
  return outstandingOf(all) + (plan ? planRemaining(plan) : 0);
}

// ---------- spend ----------
export type SpendInput = { merchant: string; category: string; amount: number; confirmed: boolean };

const SPEND_REFUSALS = {
  invalid_amount: "Enter an amount in whole rupees.",
  line_not_active: "Your line is not active right now, so new spends are paused.",
  over_available: "That is more than you have available.",
} as const;

export async function spend(tx: Tx, userId: string, input: SpendInput) {
  const c = await getConfig(tx);
  const today = await todayFor(tx, userId);
  const u = await getUser(tx, userId);
  const line = await requireLine(tx, userId);
  if (line.selfFrozen) throw new UserError("You froze your line in Settings. Unfreeze it to spend.");
  if ((await brakeFor(tx, u.cohort)) === "stop") throw new UserError("New spends are paused for your sign-up month by our risk controls.", 409);
  if (await activeHardshipPlan(tx, line.id)) throw new UserError("Spending is paused while your repayment plan is running.");
  const cycle = await openCycle(tx, line.id);
  if (!cycle) throw new UserError("Your line has no open cycle.", 409);

  const outstanding = await lineOutstanding(tx, line);
  const check = checkSpend({ amount: input.amount, status: line.status, currentLimit: line.currentLimit, outstanding }, c);
  if (!check.ok) throw new UserError(SPEND_REFUSALS[check.reason]);
  if (check.needsConfirm && !input.confirmed) {
    return { needsConfirm: true as const, amount: input.amount, dueDate: cycle.dueDate, payday: line.payday, limit: line.currentLimit };
  }

  const paid = await sandboxUpi.pay(input.merchant, input.amount);
  if (!paid.ok) throw new UserError(paid.reason);
  const [txn] = await tx
    .insert(transactions)
    .values({
      userId,
      lineId: line.id,
      cycleId: cycle.id,
      merchant: input.merchant,
      category: input.category,
      amount: input.amount,
      bigSpendConfirmed: check.needsConfirm,
      spentOn: today,
    })
    .returning();
  await tx.update(cycles).set({ spendTotal: sql`${cycles.spendTotal} + ${input.amount}` }).where(eq(cycles.id, cycle.id));
  await tx.insert(revenueLedger).values({ userId, lineId: line.id, type: "interchange", amount: interchangeOn(input.amount, c) });

  const newOutstanding = outstanding + input.amount;
  const util = utilisation(newOutstanding, line.currentLimit, c);
  if (util.amber && !cycle.nudged) await tx.update(cycles).set({ nudged: true }).where(eq(cycles.id, cycle.id));

  const [{ n }] = await tx.select({ n: count() }).from(transactions).where(eq(transactions.userId, userId));
  const hits = momentsToFire(
    {
      totalSpends: n,
      utilisationPct: util.pct,
      cycleN: cycle.n,
      today,
      unpaidDue: null,
      closedCycles: 0,
      justClosedCycle: null,
      justRaisedTo: null,
    },
    await shownMomentKeys(tx, userId),
    c,
  );
  // first_score is never fired from a spend; it belongs to cycle closing.
  const spendHits = hits.filter((h) => h.trigger === "first_spend" || h.trigger === "utilisation_cross");
  await recordMoments(tx, userId, spendHits, { amount: input.amount, merchant: input.merchant, utilisationPct: util.pct, limit: line.currentLimit });
  return { needsConfirm: false as const, txn, ref: paid.ref, utilisation: util, moments: spendHits.map((h) => h.trigger) };
}

// ---------- repay ----------
/** Pay everything owed now (pay-in-full only): unpaid statements plus this cycle's spending. */
export async function repayAll(tx: Tx, userId: string, method: "manual" | "autopay" = "manual") {
  const c = await getConfig(tx);
  const today = await todayFor(tx, userId);
  const line = await requireLine(tx, userId);
  if (await activeHardshipPlan(tx, line.id)) throw new UserError("You are on a repayment plan. Pay your next instalment instead.");
  const all = await lineCycles(tx, line.id);
  const due = all.filter((x) => x.status !== "settled" && unpaidOf(x) > 0);
  if (due.length === 0) throw new UserError("You owe nothing right now.");
  let total = 0;
  for (const cy of due) {
    const amount = unpaidOf(cy);
    total += amount;
    await tx.insert(repayments).values({ userId, cycleId: cy.id, amount, method, status: "success", paidOn: today });
    await tx.update(cycles).set({ paidAmount: cy.paidAmount + amount, paidAt: today }).where(eq(cycles.id, cy.id));
    if (cy.status === "billed") await settleCycle(tx, line, { ...cy, paidAmount: cy.paidAmount + amount, paidAt: today }, today, c);
  }
  await afterRepayment(tx, userId, today, c);
  return { paid: total };
}

/**
 * A billed cycle has been paid in full: decide on-time, then pay cashback and the healthy-account
 * fee for an on-time cycle. The ladder check runs in afterRepayment, once all cycles are settled.
 */
export async function settleCycle(tx: Tx, line: Line, cy: Cycle, paidOn: IsoDate, c: Config) {
  const statement = cy.statementAmount ?? 0;
  const onTime = isOnTime(statement, cy.paidAmount, paidOn, cy.dueDate);
  await tx.update(cycles).set({ status: "settled", onTime }).where(eq(cycles.id, cy.id));
  if (!onTime) return;
  const cashback = cashbackFor({ onTime, cycleSpend: cy.spendTotal, tier: line.tier }, c);
  if (cashback > 0) await tx.insert(rewards).values({ userId: line.userId, cycleId: cy.id, amount: cashback, reason: `On-time repayment, cycle ${cy.n}` });
  if (statement > 0) await tx.insert(revenueLedger).values({ userId: line.userId, lineId: line.id, type: "healthy_account_fee", amount: healthyAccountFee(true, c) });
}

/**
 * After money comes in: lift any pause once nothing is overdue (with the comeback rule if the
 * slip went past grace), then run the ladder on the clean-cycle streak.
 */
export async function afterRepayment(tx: Tx, userId: string, today: IsoDate, c: Config) {
  let line = (await getLine(tx, userId))!;
  const all = await lineCycles(tx, line.id);
  const stillLate = all.some((x) => x.status === "billed" && unpaidOf(x) > 0 && x.slipStep >= 3);
  const plan = await activeHardshipPlan(tx, line.id);

  if (!stillLate && !plan && ["paused", "frozen", "recovery"].includes(line.status)) {
    // Look at the most recent late cycle: paying inside grace (step 3) carries no limit cut;
    // anything later starts the comeback.
    const lastLate = [...all].reverse().find((x) => x.onTime === false);
    const wentPastGrace = (lastLate?.slipStep ?? 0) >= 4;
    const patch: Partial<Line> = { status: "active" };
    if (wentPastGrace && line.comebackRestoreLimit === null) {
      patch.comebackRestoreLimit = line.currentLimit;
      patch.currentLimit = comebackLimit(line.currentLimit, c);
      await tx.insert(ladderEvents).values({ userId, lineId: line.id, fromLimit: line.currentLimit, toLimit: patch.currentLimit, reason: "comeback_start", createdOn: today });
    }
    await tx.update(creditLines).set(patch).where(eq(creditLines.id, line.id));
    await audit(tx, actor(userId), "line_status", `credit_lines:${line.id}`, { status: line.status, limit: line.currentLimit }, patch);
    await notify(tx, userId, "dues_cleared", { comeback: Boolean(patch.comebackRestoreLimit) }, today);
    line = (await getLine(tx, userId))!;
  }
  await runLadder(tx, line, today, c);
}

export async function runLadder(tx: Tx, line: Line, today: IsoDate, c: Config) {
  const u = await getUser(tx, line.userId);
  const streak = cleanStreak(historyOf(await lineCycles(tx, line.id), today));
  const patch: Partial<Line> = {};
  let current = line.currentLimit;

  // Comeback: enough clean cycles restore the limit the user had before slipping.
  if (line.comebackRestoreLimit !== null && comebackRestored(streak, c)) {
    if (line.comebackRestoreLimit > current) {
      await tx.insert(ladderEvents).values({ userId: u.id, lineId: line.id, fromLimit: current, toLimit: line.comebackRestoreLimit, reason: "comeback_restored", createdOn: today });
      current = line.comebackRestoreLimit;
    }
    patch.comebackRestoreLimit = null;
    patch.currentLimit = current;
  }

  const decision = await latestDecision(tx, u.id);
  const r = evaluateLadder(
    {
      streak,
      baseLimit: line.baseLimit,
      currentLimit: current,
      status: line.status,
      brake: await brakeFor(tx, u.cohort),
      latestInflow: decision?.avgInflow ?? 0,
    },
    c,
  );
  const tier = tierFor(streak, c);
  if (tier !== line.tier) patch.tier = tier;

  if (r.action === "raise") {
    patch.currentLimit = r.toLimit;
    await tx.insert(ladderEvents).values({ userId: u.id, lineId: line.id, fromLimit: current, toLimit: r.toLimit, reason: `ladder_${streak}_cycles`, createdOn: today });
    const hits = momentsToFire(
      { totalSpends: 0, utilisationPct: 0, cycleN: 0, today, unpaidDue: null, closedCycles: 0, justClosedCycle: null, justRaisedTo: r.toLimit },
      await shownMomentKeys(tx, u.id),
      c,
    );
    await recordMoments(tx, u.id, hits, { from: current, to: r.toLimit, streak });
    await notify(tx, u.id, "limit_raised", { from: current, to: r.toLimit }, today);
  } else if (r.action === "graduate") {
    patch.status = "graduated";
    await tx.insert(ladderEvents).values({ userId: u.id, lineId: line.id, fromLimit: current, toLimit: current, reason: "graduated", createdOn: today });
    await tx.insert(revenueLedger).values({ userId: u.id, lineId: line.id, type: "graduation_fee", amount: graduationFee(c) });
    await notify(tx, u.id, "graduated", { partner: c.partner_bank_name }, today);
  }
  if (Object.keys(patch).length) {
    await tx.update(creditLines).set(patch).where(eq(creditLines.id, line.id));
    if (patch.currentLimit !== undefined || patch.status) await audit(tx, "system", "ladder", `credit_lines:${line.id}`, { limit: line.currentLimit, status: line.status }, patch);
  }
  return { ...r, streak };
}

// ---------- hardship ----------
export async function hardshipQuote(tx: Tx, userId: string) {
  const c = await getConfig(tx);
  const line = await requireLine(tx, userId);
  const all = await lineCycles(tx, line.id);
  const late = all.filter((x) => x.status === "billed" && unpaidOf(x) > 0);
  const principal = late.reduce((s, x) => s + unpaidOf(x), 0);
  const eligible = late.some((x) => x.slipStep >= 5);
  return {
    eligible,
    principal,
    plans: eligible && principal > 0 ? c.hardship_months_options.map((m) => buildHardshipPlan(principal, m, c)) : [],
  };
}

export async function startHardshipPlan(tx: Tx, userId: string, months: number) {
  const c = await getConfig(tx);
  const today = await todayFor(tx, userId);
  const line = await requireLine(tx, userId);
  if (await activeHardshipPlan(tx, line.id)) throw new UserError("You already have a plan running.");
  const q = await hardshipQuote(tx, userId);
  if (!q.eligible || q.principal <= 0) throw new UserError("A repayment plan opens once a bill is past the grace and reminder steps.");
  let plan;
  try {
    plan = buildHardshipPlan(q.principal, months, c);
  } catch (e) {
    throw new UserError((e as Error).message);
  }
  const schedule: Instalment[] = plan.schedule.map((i) => ({ ...i, due: addDays(today, c.cycle_length_days * i.n) }));
  const [row] = await tx
    .insert(hardshipPlans)
    .values({
      userId,
      lineId: line.id,
      principal: plan.principal,
      apr: plan.apr,
      months,
      scheduleJson: schedule,
      totalInterest: plan.totalInterest,
      ascendRevenue: plan.ascendRevenue,
      startedOn: today,
    })
    .returning();
  // The late bills move into the plan. They stay on record as not paid on time.
  const all = await lineCycles(tx, line.id);
  for (const cy of all.filter((x) => x.status === "billed" && unpaidOf(x) > 0)) {
    await tx.update(cycles).set({ status: "settled", onTime: false }).where(eq(cycles.id, cy.id));
  }
  await tx.update(creditLines).set({ status: "frozen" }).where(eq(creditLines.id, line.id));
  await audit(tx, actor(userId), "hardship_plan_started", `hardship_plans:${row.id}`, null, { principal: plan.principal, months, total: plan.total });
  return row;
}

export async function payInstalment(tx: Tx, userId: string) {
  const c = await getConfig(tx);
  const today = await todayFor(tx, userId);
  const line = await requireLine(tx, userId);
  const plan = await activeHardshipPlan(tx, line.id);
  if (!plan) throw new UserError("You have no repayment plan.");
  const schedule = plan.scheduleJson as Instalment[];
  const next = schedule[plan.paidInstalments];
  await tx.insert(repayments).values({ userId, hardshipPlanId: plan.id, amount: next.amount, method: "hardship", status: "success", paidOn: today });
  const paidInstalments = plan.paidInstalments + 1;
  const done = paidInstalments === schedule.length;
  await tx.update(hardshipPlans).set({ paidInstalments, status: done ? "completed" : "active" }).where(eq(hardshipPlans.id, plan.id));
  if (done) await afterRepayment(tx, userId, today, c);
  return { paid: next.amount, done };
}

// ---------- settings ----------
export async function setAutopay(tx: Tx, userId: string, on: boolean) {
  const line = await requireLine(tx, userId);
  await tx.update(creditLines).set({ autopayOn: on }).where(eq(creditLines.id, line.id));
  await audit(tx, actor(userId), "autopay", `credit_lines:${line.id}`, { autopayOn: line.autopayOn }, { autopayOn: on });
}

/** Applies from the next cycle, so a bill already issued never moves. */
export async function setDueDay(tx: Tx, userId: string, dueDay: number) {
  const line = await requireLine(tx, userId);
  await tx.update(creditLines).set({ dueDay }).where(eq(creditLines.id, line.id));
  await audit(tx, actor(userId), "due_day", `credit_lines:${line.id}`, { dueDay: line.dueDay }, { dueDay });
}

export async function setSelfFreeze(tx: Tx, userId: string, frozen: boolean) {
  const line = await requireLine(tx, userId);
  await tx.update(creditLines).set({ selfFrozen: frozen }).where(eq(creditLines.id, line.id));
  await audit(tx, actor(userId), "self_freeze", `credit_lines:${line.id}`, { selfFrozen: line.selfFrozen }, { selfFrozen: frozen });
}

/** During cooling-off the user can leave by repaying what they spent: principal only, no fees. */
export async function exitCoolingOff(tx: Tx, userId: string) {
  const today = await todayFor(tx, userId);
  const line = await requireLine(tx, userId);
  if (line.status !== "cooling_off") throw new UserError("The cooling-off period has ended.");
  const all = await lineCycles(tx, line.id);
  const owed = outstandingOf(all);
  for (const cy of all.filter((x) => unpaidOf(x) > 0)) {
    await tx.insert(repayments).values({ userId, cycleId: cy.id, amount: unpaidOf(cy), method: "manual", status: "success", paidOn: today });
  }
  await tx.update(cycles).set({ status: "settled", paidAt: today, paidAmount: sql`${cycles.spendTotal}` }).where(eq(cycles.lineId, line.id));
  await tx.update(creditLines).set({ status: "closed" }).where(eq(creditLines.id, line.id));
  await audit(tx, actor(userId), "cooling_off_exit", `credit_lines:${line.id}`, { status: line.status }, { status: "closed", repaid: owed });
  return { repaid: owed };
}

export async function lineTransactions(tx: Tx, userId: string) {
  const line = await requireLine(tx, userId);
  return tx.select().from(transactions).where(eq(transactions.lineId, line.id)).orderBy(asc(transactions.createdAt));
}

export async function userRewards(tx: Tx, userId: string) {
  return tx.select().from(rewards).where(eq(rewards.userId, userId)).orderBy(asc(rewards.createdAt));
}
