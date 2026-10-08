import { z } from "zod";

/**
 * Every business rule Ascend uses. Values live in the `config` table (seeded by db/seed.ts,
 * editable on the Admin page). Code reads them through getConfig() and never uses literals.
 */
const pct = z.number().min(0).max(100);
const rupees = z.number().int().min(0);
const days = z.number().int().min(0);

export const ladderRung = z.union([
  z.object({ cycles: z.number().int().positive(), mult: z.number().positive() }),
  z.object({ cycles: z.number().int().positive(), action: z.literal("graduate") }),
]);

export const momentTrigger = z.enum([
  "first_spend",
  "utilisation_cross",
  "due_soon",
  "cycle_closed",
  "ladder_unlock",
  "first_score",
]);

export const configSchema = z.object({
  // Limit
  limit_pct: pct,
  limit_min: rupees,
  limit_max: rupees,
  ladder_max: rupees,
  limit_rounding: z.number().int().positive(),
  // Eligibility
  min_age: z.number().int().positive(),
  min_inflow: rupees,
  min_history_months: z.number().int().positive(),
  bounce_lookback_days: days,
  bounce_keywords: z.array(z.string().min(1)),
  // Ladder
  ladder: z.array(ladderRung).min(1),
  // Cycle
  cycle_length_days: z.number().int().positive(),
  payday_due_offset_days: days,
  // Slip timing
  reminder_before_days: days,
  grace_days: days,
  bureau_report_dpd: days,
  freeze_dpd: days,
  recovery_dpd: days,
  dlg_invoke_dpd: days,
  // Fees
  interest_on_time_pct: pct,
  late_fee: rupees,
  processing_fee: rupees,
  annual_fee: rupees,
  foreclosure_fee: rupees,
  // Hardship
  hardship_apr_pct: pct,
  hardship_months_options: z.array(z.number().int().positive()).min(1),
  ascend_share_of_hardship: pct,
  // Nudges
  cooling_off_days: days,
  big_spend_confirm_pct: pct,
  utilisation_nudge_pct: pct,
  // Rewards
  cashback_by_tier: z.array(rupees).min(1),
  cashback_min_cycle_spend: rupees,
  // Journey
  comeback_cycles: z.number().int().positive(),
  recheck_days: days,
  first_score_cycle: z.number().int().positive(),
  // Risk
  dpd_target_pct: pct,
  brake_pct: pct,
  stop_pct: pct,
  dlg_cap_pct: pct,
  // Revenue (paid to Ascend by the partner bank, never by the student)
  interchange_pct: pct,
  healthy_account_fee: rupees,
  graduation_fee: rupees,
  // Identity
  partner_bank_name: z.string().min(1),
  grievance_escalation_days: days,
  grievance_officer: z.object({ name: z.string().min(1), email: z.string().email(), phone: z.string().min(1) }),
  moment_triggers: z.array(momentTrigger),
});

export type Config = z.infer<typeof configSchema>;
export type ConfigKey = keyof Config;
export type LadderRung = z.infer<typeof ladderRung>;
export type MomentTrigger = z.infer<typeof momentTrigger>;

/** Cross-field rules a single-value check cannot catch. Returns human-readable problems. */
export function configProblems(c: Config): string[] {
  const p: string[] = [];
  if (c.limit_min > c.limit_max) p.push("limit_min must not exceed limit_max.");
  if (c.limit_max > c.ladder_max) p.push("limit_max must not exceed ladder_max.");
  if (!(c.grace_days < c.bureau_report_dpd && c.bureau_report_dpd < c.freeze_dpd && c.freeze_dpd < c.recovery_dpd && c.recovery_dpd <= c.dlg_invoke_dpd)) {
    p.push("Slip days must rise: grace_days < bureau_report_dpd < freeze_dpd < recovery_dpd ≤ dlg_invoke_dpd.");
  }
  if (!(c.dpd_target_pct < c.brake_pct && c.brake_pct < c.stop_pct)) p.push("Risk levels must rise: dpd_target_pct < brake_pct < stop_pct.");
  const cycles = c.ladder.map((r) => r.cycles);
  if (cycles.some((n, i) => i > 0 && n <= cycles[i - 1])) p.push("Ladder rungs must be in rising cycle order.");
  return p;
}

