import { and, count, eq, isNull, sum } from "drizzle-orm";
import type { Tx } from "../db";
import { withActor, SYSTEM } from "../db/actor";
import { notifications, rewards } from "../db/schema";
import { getConfig } from "../config";
import { todayFor } from "../clock";
import { daysBetween } from "../engine/dates";
import { utilisation } from "../engine/cycle";
import { cleanStreak, evaluateLadder, ladderPreview } from "../engine/ladder";
import { slipState, slipTimeline } from "../engine/slipLadder";
import { scoreJourney } from "../engine/score";
import { brakeFor, getLine, getUser, historyOf, latestDecision, lineCycles, unpaidOf } from "./common";
import { activeHardshipPlan, type Instalment } from "./line";
import { processLine } from "./daily";

/** Run the daily job for this user up to their today, so every screen shows current numbers. */
export async function catchUp(userId: string) {
  await withActor(SYSTEM, (tx) => processLine(tx, userId));
}

export type AppState = Awaited<ReturnType<typeof appState>>;

/** Everything the signed-in screens render, derived from the user's rows and config. */
export async function appState(tx: Tx, userId: string) {
  const c = await getConfig(tx);
  const today = await todayFor(tx, userId);
  const user = await getUser(tx, userId);
  const line = await getLine(tx, userId);
  const decision = await latestDecision(tx, userId);
  const [{ unread }] = await tx.select({ unread: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  const [{ cashback }] = await tx.select({ cashback: sum(rewards.amount) }).from(rewards).where(eq(rewards.userId, userId));
  const brake = await brakeFor(tx, user.cohort);
  const base = { c, today, user, decision, unread, cashback: Number(cashback ?? 0), brake };
  if (!line || line.status === "pending") return { ...base, line: null } as const;

  const cycles = await lineCycles(tx, line.id);
  const plan = await activeHardshipPlan(tx, line.id);
  const planLeft = plan ? (plan.scheduleJson as Instalment[]).slice(plan.paidInstalments).reduce((s, i) => s + i.amount, 0) : 0;
  const open = cycles.find((x) => x.status === "open") ?? null;
  const unpaidBills = cycles.filter((x) => x.status === "billed" && unpaidOf(x) > 0);
  const bill = unpaidBills[0] ?? null;
  const outstanding = cycles.filter((x) => x.status !== "settled").reduce((s, x) => s + unpaidOf(x), 0) + planLeft;
  const available = Math.max(0, line.currentLimit - outstanding);
  const util = utilisation(outstanding, line.currentLimit, c);
  const history = historyOf(cycles, today);
  const streak = cleanStreak(history);
  const onTimeCount = history.filter(Boolean).length;
  const slip = bill ? slipState({ today, due: bill.dueDate, unpaid: unpaidOf(bill) }, c) : null;
  const ladder = evaluateLadder(
    { streak, baseLimit: line.baseLimit, currentLimit: line.currentLimit, status: line.status, brake, latestInflow: decision?.avgInflow ?? 0 },
    c,
  );

  return {
    ...base,
    line,
    cycles,
    open,
    bill,
    plan,
    planLeft,
    outstanding,
    available,
    util,
    streak,
    onTimeCount,
    /** Cycles on the repayment record (₹0 cycles and not-yet-due bills excluded). */
    settledCount: history.length,
    slip,
    slipDates: bill ? slipTimeline(bill.dueDate, c) : null,
    daysToDue: bill ? daysBetween(today, bill.dueDate) : open ? daysBetween(today, open.dueDate) : null,
    rungs: ladderPreview(line.baseLimit, c),
    ladderNext: ladder.next,
    ladderBlockedBy: ladder.blockedBy,
    journey: scoreJourney(history, c),
  } as const;
}

export type LineState = Exclude<AppState, { line: null }>;
