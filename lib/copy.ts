import type { Config } from "./config/schema";
import { inr, longDate, ordinal } from "./format";

/**
 * Words for moment cards and notifications. The sentences are fixed copy; every number in them
 * comes from the stored event payload or from config.
 */
type P = Record<string, unknown>;
const n = (p: P, k: string) => Number(p[k] ?? 0);
const s = (p: P, k: string) => String(p[k] ?? "");

export function momentCopy(trigger: string, p: P, c: Config): { tip: string; why: string; tone: "teal" | "amber"; label: string } {
  switch (trigger) {
    case "first_spend":
      return {
        label: "First spend",
        tip: `Your first spend: ${inr(n(p, "amount"))} at ${s(p, "merchant")}. Your credit record has started.`,
        why: "Every bill you pay in full and on time is reported as a good month. Small spends you can easily repay build the same record as big ones.",
        tone: "teal",
      };
    case "utilisation_cross":
      return {
        label: "Usage check",
        tip: `You've used ${n(p, "utilisationPct")}% of your limit, above the ${c.utilisation_nudge_pct}% line.`,
        why: "Bureaus read high usage as stretched. Paying part of your bill early brings it down, and there's no fee to do it.",
        tone: "amber",
      };
    case "due_soon":
      return {
        label: "Due soon",
        tip: `${inr(n(p, "amount"))} is due on ${longDate(s(p, "due"))}.`,
        why: "Paying in full by the due date costs nothing and counts as an on-time month.",
        tone: "teal",
      };
    case "cycle_closed":
      return {
        label: `Cycle ${n(p, "cycle")} closed`,
        tip: n(p, "statement") > 0 ? `Your statement is ${inr(n(p, "statement"))}, due ${longDate(s(p, "due"))}.` : "Nothing spent this cycle, so nothing to pay.",
        why: "A cycle closes every few weeks. What you spent becomes one bill, and paying it in full on time is what moves your ladder.",
        tone: "teal",
      };
    case "ladder_unlock":
      return {
        label: "Ladder unlocked",
        tip: `Your limit went from ${inr(n(p, "from"))} to ${inr(n(p, "to"))} after ${n(p, "streak")} on-time cycles.`,
        why: "We raise limits only for behaviour: on-time payments in a row. You never have to ask.",
        tone: "teal",
      };
    case "first_score":
      return {
        label: "First score",
        tip: `${n(p, "closedCycles")} cycles done. That's usually enough history for a first credit score.`,
        why: "Bureaus generally need about six months of repayment history before they can score you.",
        tone: "teal",
      };
    default:
      return { label: "Moment", tip: "", why: "", tone: "teal" };
  }
}

export function notificationCopy(template: string, p: P, c: Config): string {
  switch (template) {
    case "statement_ready":
      return `Cycle ${n(p, "cycle")} statement: ${inr(n(p, "amount"))}, due ${longDate(s(p, "due"))}.`;
    case "due_reminder":
      return `Reminder: ${inr(n(p, "amount"))} is due on ${longDate(s(p, "due"))}.`;
    case "autopay_success":
      return `AutoPay paid ${inr(n(p, "amount"))}${p.retry ? " on the retry" : ""}. You're on time.`;
    case "autopay_failed":
      return `AutoPay didn't go through for ${inr(n(p, "amount"))}.${p.retryOnPayday ? ` We'll retry on the ${ordinal(n(p, "retryOnPayday"))}.` : ""} You can pay now in one tap.`;
    case "autopay_due":
      return `${inr(n(p, "amount"))} is due today.`;
    case "grace":
      return `Payment missed. You're in grace: ${inr(n(p, "lateFee"))} fee, spends paused until you pay.`;
    case "reminders":
    case "weekly_notice":
      return `${inr(n(p, "amount"))} is overdue. It is reported to credit bureaus on day ${c.bureau_report_dpd}.`;
    case "bureau_reported":
      return `${inr(n(p, "amount"))} is now ${n(p, "dpd")} days late and has been reported to the bureaus.`;
    case "freeze_plan":
      return `Your line is frozen. You can split ${inr(n(p, "amount"))} into a ${c.hardship_months_options.join(" or ")}-month plan.`;
    case "recovery":
      return `Your account has moved to ${c.partner_bank_name}'s regulated recovery process. We never contact family or friends.`;
    case "dues_cleared":
      return p.comeback ? `Dues cleared. Your comeback starts: ${c.comeback_cycles} on-time cycles restore your limit.` : "Dues cleared. Spends are back on.";
    case "limit_raised":
      return `Your limit went up from ${inr(n(p, "from"))} to ${inr(n(p, "to"))}.`;
    case "graduated":
      return `You've graduated! ${s(p, "partner")} has a credit card offer for you.`;
    default:
      return template;
  }
}
