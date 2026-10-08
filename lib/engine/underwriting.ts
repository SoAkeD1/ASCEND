import type { Config } from "../config/schema";
import { addDays, addYears, ageOn, daysBetween, type IsoDate } from "./dates";
import type { InflowSummary } from "./inflow";
import { computeOffer, type Offer } from "./limit";
import type { BureauStatus } from "./types";

export type UnderwritingRules = Pick<
  Config,
  "min_age" | "min_inflow" | "min_history_months" | "bounce_lookback_days" | "recheck_days" | "limit_pct" | "limit_min" | "limit_max" | "limit_rounding"
>;

export type UnderwritingInput = {
  dob: IsoDate;
  today: IsoDate;
  bureau: { status: BureauStatus; overdueAmount: number };
  inflow: InflowSummary;
};

export type ReasonKey = "under_age" | "active_default" | "low_inflow" | "short_history" | "recent_bounce";

export type Decision = {
  decision: "approved" | "builder" | "age_block";
  /** The first rule that failed; null when approved. */
  reasonKey: ReasonKey | null;
  /** What the user has, and what the rule needs, in the reason's own unit (₹, months or days). */
  actualValue: number | null;
  requiredValue: number | null;
  gate1Pass: boolean | null;
  gate2: { inflowOk: boolean; historyOk: boolean; bounceOk: boolean } | null;
  offer: Offer | null;
  /** Builder: when we re-check automatically. Age block: the 18th birthday. */
  recheckAt: IsoDate | null;
};

const empty = { gate1Pass: null, gate2: null, offer: null } as const;

/**
 * Order matters and is fixed: age, then Gate 1 (bureau), then Gate 2 (cash flow: inflow, history,
 * bounce). The user is told the FIRST failing check, with their real number against the rule.
 */
export function underwrite(input: UnderwritingInput, rules: UnderwritingRules): Decision {
  const { dob, today, bureau, inflow } = input;

  const blocked = ageCheck(dob, today, rules);
  if (blocked) return blocked;

  const recheckAt = addDays(today, rules.recheck_days);

  if (bureau.status === "active_default") {
    return { ...empty, decision: "builder", reasonKey: "active_default", actualValue: bureau.overdueAmount, requiredValue: 0, gate1Pass: false, recheckAt };
  }

  const daysSinceBounce = inflow.lastBounceDate ? daysBetween(inflow.lastBounceDate, today) : null;
  const gate2 = {
    inflowOk: inflow.avgMonthlyInflow >= rules.min_inflow,
    historyOk: inflow.historyMonths >= rules.min_history_months,
    bounceOk: daysSinceBounce === null || daysSinceBounce > rules.bounce_lookback_days,
  };

  const fail = (reasonKey: ReasonKey, actualValue: number, requiredValue: number): Decision => ({
    decision: "builder",
    reasonKey,
    actualValue,
    requiredValue,
    gate1Pass: true,
    gate2,
    offer: null,
    recheckAt,
  });

  if (!gate2.inflowOk) return fail("low_inflow", inflow.avgMonthlyInflow, rules.min_inflow);
  if (!gate2.historyOk) return fail("short_history", inflow.historyMonths, rules.min_history_months);
  // For a bounce, "actual" is days since it happened and "required" is the look-back window.
  if (!gate2.bounceOk) return fail("recent_bounce", daysSinceBounce!, rules.bounce_lookback_days);

  return {
    decision: "approved",
    reasonKey: null,
    actualValue: null,
    requiredValue: null,
    gate1Pass: true,
    gate2,
    offer: computeOffer(inflow.avgMonthlyInflow, rules),
    recheckAt: null,
  };
}

/** The age rule alone, run as soon as the date of birth is entered. Null when old enough. */
export function ageCheck(dob: IsoDate, today: IsoDate, rules: Pick<Config, "min_age">): Decision | null {
  const age = ageOn(dob, today);
  if (age >= rules.min_age) return null;
  return { ...empty, decision: "age_block", reasonKey: "under_age", actualValue: age, requiredValue: rules.min_age, recheckAt: addYears(dob, rules.min_age) };
}

/** Progress toward passing, 0..1, for the Builder screen's bar. */
export function builderProgress(reasonKey: ReasonKey, actual: number, required: number): number {
  if (reasonKey === "active_default") return actual <= 0 ? 1 : 0; // cleared or not; no partial credit for debt
  if (required <= 0) return 1;
  return Math.max(0, Math.min(1, actual / required));
}

/** The date a recent bounce stops counting, so the Builder screen can show it. */
export const bounceClearsOn = (lastBounceDate: IsoDate, rules: Pick<Config, "bounce_lookback_days">) =>
  addDays(lastBounceDate, rules.bounce_lookback_days + 1);
