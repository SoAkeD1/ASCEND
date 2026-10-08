import type { Config } from "../config/schema";

export type HardshipRules = Pick<Config, "hardship_apr_pct" | "hardship_months_options" | "ascend_share_of_hardship">;

export type Instalment = { n: number; amount: number };

export type HardshipPlan = {
  principal: number;
  apr: number;
  months: number;
  /** Unrounded EMI, shown to explain the maths. */
  emi: number;
  schedule: Instalment[];
  totalInterest: number;
  total: number;
  ascendRevenue: number;
};

/**
 * EMI = P·r(1+r)^n / ((1+r)^n − 1), r = APR/12/100. Each instalment is rounded to the rupee and the
 * rounding difference goes into the LAST one, so the schedule sums exactly to round(P + interest).
 */
export function buildHardshipPlan(principal: number, months: number, rules: HardshipRules): HardshipPlan {
  if (!Number.isFinite(principal) || principal <= 0) throw new RangeError("Principal must be positive.");
  if (!rules.hardship_months_options.includes(months)) {
    throw new RangeError(`Months must be one of ${rules.hardship_months_options.join(", ")}.`);
  }
  const r = rules.hardship_apr_pct / 12 / 100;
  const emi = r === 0 ? principal / months : (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1);
  const exactInterest = emi * months - principal;
  const total = Math.round(principal + exactInterest);
  const each = Math.round(emi);
  const schedule = Array.from({ length: months }, (_, i) => ({
    n: i + 1,
    amount: i < months - 1 ? each : total - each * (months - 1),
  }));
  const totalInterest = total - principal;
  return {
    principal,
    apr: rules.hardship_apr_pct,
    months,
    emi,
    schedule,
    totalInterest,
    total,
    ascendRevenue: Math.round((totalInterest * rules.ascend_share_of_hardship) / 100),
  };
}
