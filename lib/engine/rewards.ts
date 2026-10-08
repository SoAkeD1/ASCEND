import type { Config } from "../config/schema";

export type RewardRules = Pick<Config, "cashback_by_tier" | "cashback_min_cycle_spend" | "late_fee">;

/**
 * Cashback rewards paying on time, not spending more: the amount depends only on the tier, and the
 * minimum spend only stops a ₹0 cycle from earning. Tiers above the list use the top entry.
 */
export function cashbackFor(input: { onTime: boolean; cycleSpend: number; tier: number }, rules: RewardRules): number {
  if (!input.onTime || input.cycleSpend < rules.cashback_min_cycle_spend) return 0;
  const i = Math.min(Math.max(input.tier, 1), rules.cashback_by_tier.length) - 1;
  return rules.cashback_by_tier[i];
}

/** The late fee is whatever config says (seeded at 0). There is no other source of a late charge. */
export const lateFee = (rules: RewardRules) => rules.late_fee;
