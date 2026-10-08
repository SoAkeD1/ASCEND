import type { LimitRules } from "./types";

export type Offer = {
  /** The limit we offer, in rupees. */
  offer: number;
  /** inflow × limit_pct% before rounding and clamping, for showing the maths. */
  raw: number;
  /** Set when the min or max rule changed the number, so the UI can say so. */
  clampedBy: "min" | "max" | null;
};

/**
 * Offer = clamp(round_down(avgInflow × limit_pct%, limit_rounding), limit_min, limit_max).
 */
export function computeOffer(avgMonthlyInflow: number, rules: LimitRules): Offer {
  if (!Number.isFinite(avgMonthlyInflow) || avgMonthlyInflow < 0) {
    throw new RangeError("Average monthly inflow must be a non-negative number.");
  }
  const raw = (avgMonthlyInflow * rules.limit_pct) / 100;
  const rounded = Math.floor(raw / rules.limit_rounding) * rules.limit_rounding;

  if (rounded < rules.limit_min) return { offer: rules.limit_min, raw, clampedBy: "min" };
  if (rounded > rules.limit_max) return { offer: rules.limit_max, raw, clampedBy: "max" };
  return { offer: rounded, raw, clampedBy: null };
}

/**
 * The user may pick a LOWER limit than offered (slider from limit_min to offer),
 * never a higher one. The choice is rounded down to the same step as offers.
 */
export function chooseLimit(requested: number, offer: number, rules: LimitRules): number {
  if (!Number.isFinite(requested)) throw new RangeError("Chosen limit must be a number.");
  if (requested > offer) throw new RangeError("Chosen limit cannot be higher than the offer.");
  const stepped = Math.floor(requested / rules.limit_rounding) * rules.limit_rounding;
  if (stepped < rules.limit_min) throw new RangeError("Chosen limit cannot be below the minimum.");
  return stepped;
}
