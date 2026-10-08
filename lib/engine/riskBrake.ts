import type { Config } from "../config/schema";
import type { BrakeState } from "./ladder";

export type RiskRules = Pick<Config, "bureau_report_dpd" | "dpd_target_pct" | "brake_pct" | "stop_pct" | "dlg_cap_pct">;

/** 30+ DPD % = outstanding on lines at or past bureau_report_dpd ÷ all outstanding. */
export function dpdPct(lines: { outstanding: number; dpd: number }[], rules: RiskRules): number {
  const total = lines.reduce((s, l) => s + l.outstanding, 0);
  if (total <= 0) return 0;
  const late = lines.filter((l) => l.dpd >= rules.bureau_report_dpd).reduce((s, l) => s + l.outstanding, 0);
  return Math.round((late / total) * 100 * 100) / 100;
}

/**
 * ≥ stop_pct → stop; ≥ brake_pct → brake; below dpd_target_pct → released.
 * Between target and brake the current state holds, so the brake does not flicker on and off.
 */
export function nextBrakeState(pct: number, current: BrakeState, rules: RiskRules): BrakeState {
  if (pct >= rules.stop_pct) return "stop";
  if (pct >= rules.brake_pct) return "brake";
  if (pct < rules.dpd_target_pct) return "none";
  return current;
}

/** How much the default-loss guarantee can still cover, capped at dlg_cap_pct of the cohort's book. */
export function dlgCover(input: { unpaid: number; cohortBook: number; usedSoFar: number }, rules: RiskRules): number {
  const room = (input.cohortBook * rules.dlg_cap_pct) / 100 - input.usedSoFar;
  return Math.max(0, Math.min(input.unpaid, Math.floor(room)));
}
