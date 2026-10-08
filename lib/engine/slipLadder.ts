import type { Config } from "../config/schema";
import { addDays, daysBetween, type IsoDate } from "./dates";
import type { LineStatus } from "./types";

export type SlipRules = Pick<
  Config,
  "reminder_before_days" | "grace_days" | "bureau_report_dpd" | "freeze_dpd" | "recovery_dpd" | "dlg_invoke_dpd" | "late_fee"
>;

export type SlipStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const STEP_NAMES: Record<SlipStep, string> = {
  0: "All clear",
  1: "Reminder",
  2: "AutoPay",
  3: "Grace",
  4: "Reminders",
  5: "Freeze + plan",
  6: "Recovery",
};

export type SlipState = {
  step: SlipStep;
  /** Days past due. Negative before the due date. */
  dpd: number;
  /** The line status this step requires, or null if the step does not change it. */
  lineStatus: LineStatus | null;
  /** True from bureau_report_dpd onward. */
  reported: boolean;
  /** True from dlg_invoke_dpd onward. */
  dlgInvoke: boolean;
  /** Always read from config. */
  lateFee: number;
};

/**
 * Pure state machine: the step depends only on today, the due date and whether money is unpaid.
 * That is what makes the daily job idempotent: running it twice on one day gives the same answer.
 */
export function slipState(input: { today: IsoDate; due: IsoDate; unpaid: number }, rules: SlipRules): SlipState {
  const dpd = daysBetween(input.due, input.today);
  const base = { dpd, reported: false, dlgInvoke: false, lateFee: rules.late_fee, lineStatus: null };
  if (input.unpaid <= 0 || dpd < -rules.reminder_before_days) return { ...base, step: 0 };
  if (dpd < 0) return { ...base, step: 1 };
  if (dpd === 0) return { ...base, step: 2 };

  const reported = dpd >= rules.bureau_report_dpd;
  const dlgInvoke = dpd >= rules.dlg_invoke_dpd;
  const late = { ...base, reported, dlgInvoke };
  if (dpd <= rules.grace_days) return { ...late, step: 3, lineStatus: "paused" };
  if (dpd < rules.freeze_dpd) return { ...late, step: 4, lineStatus: "paused" };
  if (dpd < rules.recovery_dpd) return { ...late, step: 5, lineStatus: "frozen" };
  return { ...late, step: 6, lineStatus: "recovery" };
}

/** The calendar date each step begins, computed from the user's own due date. */
export function slipTimeline(due: IsoDate, rules: SlipRules) {
  return {
    1: addDays(due, -rules.reminder_before_days),
    2: due,
    3: addDays(due, 1),
    4: addDays(due, rules.grace_days + 1),
    reported: addDays(due, rules.bureau_report_dpd),
    5: addDays(due, rules.freeze_dpd),
    6: addDays(due, rules.recovery_dpd),
    dlg: addDays(due, rules.dlg_invoke_dpd),
  };
}

/** Step 4 sends one notice a week, to the user only, starting on its first day. */
export function isWeeklyNoticeDay(state: SlipState, rules: SlipRules): boolean {
  return state.step === 4 && (state.dpd - (rules.grace_days + 1)) % 7 === 0;
}
