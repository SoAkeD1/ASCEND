import type { Config, MomentTrigger } from "../config/schema";
import { daysBetween, type IsoDate } from "./dates";

export type MomentRules = Pick<Config, "moment_triggers" | "utilisation_nudge_pct" | "reminder_before_days" | "first_score_cycle">;

export type MomentContext = {
  /** Number of transactions the user has ever made, including this one. */
  totalSpends: number;
  utilisationPct: number;
  cycleN: number;
  today: IsoDate;
  /** Due date of the bill being waited on, if any is unpaid. */
  unpaidDue: IsoDate | null;
  /** Cycles closed so far. */
  closedCycles: number;
  /** Set when a cycle has just closed / the limit has just gone up. */
  justClosedCycle: number | null;
  justRaisedTo: number | null;
};

export type MomentHit = { trigger: MomentTrigger; key: string };

/**
 * Which moment cards should fire now. Each has a unique key so it is shown once: once ever for
 * first_spend and first_score, once per cycle for the rest. Only triggers enabled in config fire.
 */
export function momentsToFire(ctx: MomentContext, alreadyShown: Set<string>, rules: MomentRules): MomentHit[] {
  const hits: MomentHit[] = [];
  const add = (trigger: MomentTrigger, key: string) => {
    if (rules.moment_triggers.includes(trigger) && !alreadyShown.has(key)) hits.push({ trigger, key });
  };

  if (ctx.totalSpends >= 1) add("first_spend", "first_spend");
  if (ctx.utilisationPct > rules.utilisation_nudge_pct) add("utilisation_cross", `utilisation_cross:${ctx.cycleN}`);
  if (ctx.unpaidDue) {
    const daysLeft = daysBetween(ctx.today, ctx.unpaidDue);
    if (daysLeft >= 0 && daysLeft <= rules.reminder_before_days) add("due_soon", `due_soon:${ctx.unpaidDue}`);
  }
  if (ctx.justClosedCycle !== null) add("cycle_closed", `cycle_closed:${ctx.justClosedCycle}`);
  if (ctx.justRaisedTo !== null) add("ladder_unlock", `ladder_unlock:${ctx.justRaisedTo}`);
  if (ctx.closedCycles >= rules.first_score_cycle) add("first_score", "first_score");
  return hits;
}
