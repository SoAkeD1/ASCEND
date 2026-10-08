import type { Config } from "../config/schema";
import type { LineStatus } from "./types";

export type LadderRules = Pick<Config, "ladder" | "ladder_max" | "limit_rounding" | "min_inflow" | "limit_min" | "comeback_cycles">;
export type BrakeState = "none" | "brake" | "stop";

export type CycleOutcome = { n: number; status: "open" | "billed" | "settled"; statement: number | null; onTime: boolean | null; due: string };

/**
 * The repayment record, oldest → newest, one entry per cycle that had something to pay:
 * - a cycle with ₹0 owed is neutral (you can't build a record by not using credit);
 * - a settled cycle counts as its on-time result;
 * - an unpaid bill past its due date counts as a miss, even if later cycles were fine;
 * - a bill not yet due is still pending and is left out.
 */
export function repaymentHistory(cycles: CycleOutcome[], today: string): boolean[] {
  return [...cycles]
    .filter((c) => c.status !== "open" && (c.statement ?? 0) > 0)
    .sort((a, b) => a.n - b.n)
    .flatMap((c) => (c.status === "settled" ? [c.onTime === true] : c.due < today ? [false] : []));
}

/** Consecutive on-time cycles counted back from the most recent closed cycle (list is oldest → newest). */
export function cleanStreak(onTimeHistory: boolean[]): number {
  let n = 0;
  for (let i = onTimeHistory.length - 1; i >= 0 && onTimeHistory[i]; i--) n++;
  return n;
}

const stepDown = (v: number, rules: LadderRules) => Math.floor(v / rules.limit_rounding) * rules.limit_rounding;

export type Rung = { cycles: number; limit: number | null; graduate: boolean };

/** The ladder as it applies to THIS user's base limit. */
export function ladderPreview(baseLimit: number, rules: LadderRules): Rung[] {
  return rules.ladder.map((r) =>
    "mult" in r
      ? { cycles: r.cycles, limit: Math.min(stepDown(baseLimit * r.mult, rules), rules.ladder_max), graduate: false }
      : { cycles: r.cycles, limit: null, graduate: true },
  );
}

/** Tier 1 = base limit; each multiplier rung reached adds one. */
export function tierFor(streak: number, rules: LadderRules): number {
  return 1 + rules.ladder.filter((r) => "mult" in r && streak >= r.cycles).length;
}

export type LadderInput = {
  streak: number;
  baseLimit: number;
  currentLimit: number;
  status: LineStatus;
  brake: BrakeState;
  /** Average monthly inflow from the user's latest statement. */
  latestInflow: number;
};

export type LadderResult = {
  action: "none" | "raise" | "graduate" | "blocked";
  toLimit: number;
  blockedBy: "brake" | "inactive" | "low_inflow" | null;
  /** The next rung not yet reached, and how many clean cycles are still needed. */
  next: (Rung & { remaining: number }) | null;
};

export function evaluateLadder(input: LadderInput, rules: LadderRules): LadderResult {
  const rungs = ladderPreview(input.baseLimit, rules);
  const reached = rungs.filter((r) => input.streak >= r.cycles);
  const nextRung = rungs.find((r) => input.streak < r.cycles);
  const next = nextRung ? { ...nextRung, remaining: nextRung.cycles - input.streak } : null;
  const none = { toLimit: input.currentLimit, blockedBy: null, next };

  if (input.status === "graduated") return { action: "none", ...none };

  const graduate = reached.some((r) => r.graduate);
  const target = Math.max(input.currentLimit, ...reached.filter((r) => r.limit !== null).map((r) => r.limit!));
  const wantsRaise = target > input.currentLimit;
  if (!graduate && !wantsRaise) return { action: "none", ...none };

  // Graduation and raises both need a healthy, active line.
  if (input.status !== "active") return { action: "blocked", ...none, blockedBy: "inactive" };
  if (graduate) return { action: "graduate", ...none };
  if (input.brake !== "none") return { action: "blocked", ...none, blockedBy: "brake" };
  if (input.latestInflow < rules.min_inflow) return { action: "blocked", ...none, blockedBy: "low_inflow" };
  return { action: "raise", toLimit: target, blockedBy: null, next };
}

/** After dues are cleared: restart at limit_min, or the previous limit if that was lower. */
export const comebackLimit = (previousLimit: number, rules: LadderRules) => Math.min(rules.limit_min, previousLimit);

/** comeback_cycles clean cycles in a row restore the pre-slip limit. */
export const comebackRestored = (streak: number, rules: LadderRules) => streak >= rules.comeback_cycles;
