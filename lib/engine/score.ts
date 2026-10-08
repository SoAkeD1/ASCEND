import type { Config } from "../config/schema";

export type ScoreRules = Pick<Config, "first_score_cycle" | "utilisation_nudge_pct">;

export type Journey = {
  stage: "not_started" | "building" | "first_score";
  closedCycles: number;
  cyclesToFirstScore: number;
  /** One entry per cycle up to the first score, for the timeline. */
  timeline: { cycle: number; done: boolean; onTime: boolean | null }[];
};

/** The score timeline from the user's real cycle history (oldest → newest, true = on time). */
export function scoreJourney(onTimeHistory: boolean[], rules: ScoreRules): Journey {
  const closed = onTimeHistory.length;
  const length = Math.max(rules.first_score_cycle, closed);
  return {
    stage: closed === 0 ? "not_started" : closed >= rules.first_score_cycle ? "first_score" : "building",
    closedCycles: closed,
    cyclesToFirstScore: Math.max(0, rules.first_score_cycle - closed),
    timeline: Array.from({ length }, (_, i) => ({ cycle: i + 1, done: i < closed, onTime: i < closed ? onTimeHistory[i] : null })),
  };
}

export type Band = "Building" | "Fair" | "Good" | "Strong";

/**
 * ILLUSTRATIVE only, for the "what if" slider. Real bureau scores use models we do not have.
 * The two habits that matter most are paying on time and keeping usage low, so the band is built
 * from exactly those: share of on-time cycles, and usage against the nudge line.
 */
export function illustrativeBand(input: { onTimeCycles: number; lateCycles: number; utilisationPct: number }, rules: ScoreRules): Band {
  const cycles = input.onTimeCycles + input.lateCycles;
  if (cycles < rules.first_score_cycle) return "Building";
  const onTimeShare = input.onTimeCycles / cycles;
  const lowUse = input.utilisationPct <= rules.utilisation_nudge_pct;
  if (onTimeShare === 1 && lowUse) return "Strong";
  if (onTimeShare === 1) return "Good";
  return "Fair";
}
