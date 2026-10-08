import type { Config } from "../config/schema";

export type RevenueRules = Pick<Config, "interchange_pct" | "healthy_account_fee" | "graduation_fee">;

/**
 * The ONLY ways Ascend earns. All are paid by the partner bank or the network, never by the student.
 * There is deliberately no late-fee type, so late-fee revenue cannot be recorded at all.
 */
export const REVENUE_TYPES = ["interchange", "healthy_account_fee", "graduation_fee"] as const;
export type RevenueType = (typeof REVENUE_TYPES)[number];

const paise = (n: number) => Math.round(n * 100) / 100;

export const interchangeOn = (spend: number, rules: RevenueRules) => paise((spend * rules.interchange_pct) / 100);

/** One fee per cycle that closes on time. */
export const healthyAccountFee = (onTime: boolean, rules: RevenueRules) => (onTime ? rules.healthy_account_fee : 0);

export const graduationFee = (rules: RevenueRules) => rules.graduation_fee;
