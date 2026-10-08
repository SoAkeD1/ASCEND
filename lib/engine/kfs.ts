import type { Config } from "../config/schema";
import { addDays, type IsoDate } from "./dates";
import { buildHardshipPlan, type HardshipPlan } from "./hardship";
import type { Offer } from "./limit";
import { STEP_NAMES, type SlipStep } from "./slipLadder";

export type KfsInput = {
  version: number;
  today: IsoDate;
  chosenLimit: number;
  offer: Offer;
  avgMonthlyInflow: number;
  consents: { type: string; purpose: string; granted: boolean }[];
};

export type Kfs = ReturnType<typeof buildKfs>;

/**
 * Key Fact Statement. Every number is read from config or the user's own line at generation time,
 * and the whole object is snapshotted to kfs_documents when accepted, so later config edits never
 * change what the user agreed to.
 */
export function buildKfs(input: KfsInput, c: Config) {
  const { chosenLimit, offer } = input;
  const interestOnTime = Math.round((chosenLimit * c.interest_on_time_pct * c.cycle_length_days) / 100 / 365);
  const totalCost = interestOnTime + c.processing_fee + c.annual_fee;
  const aprOnTimePct = chosenLimit > 0 ? Math.round((totalCost / chosenLimit) * (365 / c.cycle_length_days) * 100 * 100) / 100 : 0;

  const slipDay: Record<Exclude<SlipStep, 0>, number> = {
    1: -c.reminder_before_days,
    2: 0,
    3: 1,
    4: c.grace_days + 1,
    5: c.freeze_dpd,
    6: c.recovery_dpd,
  };

  const examples: HardshipPlan[] = c.hardship_months_options.map((m) => buildHardshipPlan(chosenLimit, m, c));

  return {
    version: input.version,
    generatedOn: input.today,
    lender: { name: c.partner_bank_name, regulatedBy: "Reserve Bank of India" },
    ascendRole: "Lending Service Provider (LSP): we run the app; the partner bank lends and holds your loan.",
    limit: {
      chosen: chosenLimit,
      offered: offer.offer,
      calc: {
        avgMonthlyInflow: input.avgMonthlyInflow,
        limitPct: c.limit_pct,
        raw: offer.raw,
        rounding: c.limit_rounding,
        min: c.limit_min,
        max: c.limit_max,
        clampedBy: offer.clampedBy,
      },
    },
    interest: { onTimePct: c.interest_on_time_pct, aprOnTimePct },
    fees: { processing: c.processing_fee, annual: c.annual_fee, late: c.late_fee, foreclosure: c.foreclosure_fee },
    cycle: { lengthDays: c.cycle_length_days, dueOffsetDays: c.payday_due_offset_days },
    slip: ([1, 2, 3, 4, 5, 6] as const).map((step) => ({ step, name: STEP_NAMES[step], dayFromDue: slipDay[step] })),
    hardship: { aprPct: c.hardship_apr_pct, monthsOptions: c.hardship_months_options, examples, ascendShare: c.ascend_share_of_hardship },
    bureau: { reportDpd: c.bureau_report_dpd },
    coolingOff: { days: c.cooling_off_days, until: addDays(input.today, c.cooling_off_days) },
    recovery: { byPartner: c.partner_bank_name, thirdPartyContact: false },
    data: input.consents,
    grievance: { ...c.grievance_officer, escalationDays: c.grievance_escalation_days },
    totalCostOfCredit: { borrowed: chosenLimit, interest: interestOnTime, fees: c.processing_fee + c.annual_fee, total: totalCost },
  };
}
