import type { Config } from "../config/schema";
import { addDays, nextDayOfMonth, type IsoDate } from "./dates";
import type { LineStatus } from "./types";

export type CycleRules = Pick<
  Config,
  "cycle_length_days" | "payday_due_offset_days" | "reminder_before_days" | "big_spend_confirm_pct" | "utilisation_nudge_pct"
>;

/** Due day = payday + offset, wrapping past the 31st. */
export function dueDayFromPayday(payday: number, rules: CycleRules): number {
  return ((payday - 1 + rules.payday_due_offset_days) % 31) + 1;
}

export type CycleWindow = { start: IsoDate; end: IsoDate; due: IsoDate };

/**
 * A cycle covers [start, end): spends on `end` belong to the next cycle. The statement is fixed on
 * `end`. The due date is the user's due day, at least reminder_before_days after the statement so
 * the reminder never arrives before the bill exists.
 */
export function cycleWindow(start: IsoDate, dueDay: number, rules: CycleRules): CycleWindow {
  const end = addDays(start, rules.cycle_length_days);
  return { start, end, due: nextDayOfMonth(addDays(end, rules.reminder_before_days), dueDay) };
}

export type SpendCheck =
  | { ok: false; reason: "invalid_amount" | "line_not_active" | "over_available" }
  | { ok: true; needsConfirm: boolean };

export function checkSpend(
  input: { amount: number; status: LineStatus; currentLimit: number; outstanding: number },
  rules: CycleRules,
): SpendCheck {
  if (!Number.isInteger(input.amount) || input.amount <= 0) return { ok: false, reason: "invalid_amount" };
  // Cooling-off is a free look period: the line works, the user can still exit at no cost.
  if (input.status !== "active" && input.status !== "cooling_off") return { ok: false, reason: "line_not_active" };
  if (input.amount > input.currentLimit - input.outstanding) return { ok: false, reason: "over_available" };
  return { ok: true, needsConfirm: input.amount > (input.currentLimit * rules.big_spend_confirm_pct) / 100 };
}

export function utilisation(outstanding: number, currentLimit: number, rules: CycleRules) {
  const pct = currentLimit > 0 ? Math.round((outstanding / currentLimit) * 100) : 0;
  return { pct, amber: pct > rules.utilisation_nudge_pct };
}

/** On time = statement paid in full on or before the due date. A ₹0 statement owes nothing, so it is on time. */
export function isOnTime(statement: number, paid: number, paidOn: IsoDate | null, due: IsoDate): boolean {
  if (statement <= 0) return true;
  return paid >= statement && paidOn !== null && paidOn <= due;
}
