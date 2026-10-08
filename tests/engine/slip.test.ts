import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/engine/dates";
import { isWeeklyNoticeDay, slipState, slipTimeline } from "@/lib/engine/slipLadder";
import { buildHardshipPlan } from "@/lib/engine/hardship";
import { config } from "../fixtures/config";

const due = "2026-11-07";
const at = (dpd: number, unpaid = 800) => slipState({ today: addDays(due, dpd), due, unpaid }, config);

describe("slip ladder boundaries", () => {
  it.each([
    [-4, 0, null],
    [-3, 1, null],
    [0, 2, null],
    [1, 3, "paused"],
    [7, 3, "paused"], // grace_days
    [8, 4, "paused"], // grace_days + 1
    [30, 4, "paused"], // bureau_report_dpd
    [31, 5, "frozen"], // freeze_dpd
    [60, 5, "frozen"], // recovery_dpd − 1
    [61, 6, "recovery"], // recovery_dpd
    [120, 6, "recovery"], // dlg_invoke_dpd
  ])("DPD %i → step %i, line %s", (dpd, step, lineStatus) => {
    expect(at(dpd)).toMatchObject({ dpd, step, lineStatus });
  });

  it("marks bureau reporting from bureau_report_dpd and DLG from dlg_invoke_dpd", () => {
    expect(at(29).reported).toBe(false);
    expect(at(30).reported).toBe(true);
    expect(at(119).dlgInvoke).toBe(false);
    expect(at(120).dlgInvoke).toBe(true);
  });

  it("nothing unpaid means no slip, whatever the date", () => {
    expect(at(45, 0).step).toBe(0);
  });

  it("the late fee always equals config", () => {
    expect(at(10).lateFee).toBe(0);
    expect(slipState({ today: addDays(due, 10), due, unpaid: 1 }, { ...config, late_fee: 99 }).lateFee).toBe(99);
  });

  it("dates every step from the user's own due date", () => {
    expect(slipTimeline(due, config)).toEqual({
      1: "2026-11-04",
      2: "2026-11-07",
      3: "2026-11-08",
      4: "2026-11-15",
      reported: "2026-12-07",
      5: "2026-12-08",
      6: "2027-01-07",
      dlg: "2027-03-07",
    });
  });

  it("sends step-4 notices weekly, starting on its first day", () => {
    expect([8, 9, 15, 22, 29].map((d) => isWeeklyNoticeDay(at(d), config))).toEqual([true, false, true, true, true]);
  });
});

describe("hardship plan", () => {
  const cases = [1, 799, 2000, 3333, 4999, 12345].flatMap((p) => config.hardship_months_options.map((m) => [p, m] as const));

  it.each(cases)("P=%i over %i months sums exactly to round(P + interest)", (p, m) => {
    const plan = buildHardshipPlan(p, m, config);
    const sum = plan.schedule.reduce((s, i) => s + i.amount, 0);
    expect(sum).toBe(plan.total);
    expect(plan.total).toBe(Math.round(p + (plan.emi * m - p)));
    expect(plan.schedule).toHaveLength(m);
    expect(plan.ascendRevenue).toBe(0);
  });

  it("matches the EMI formula on a worked example", () => {
    const plan = buildHardshipPlan(2000, 3, config);
    expect(plan.emi).toBeCloseTo(693.51, 2);
    expect(plan.schedule.map((i) => i.amount)).toEqual([694, 694, 693]);
    expect(plan.totalInterest).toBe(81);
  });

  it("refuses a month count not in config", () => {
    expect(() => buildHardshipPlan(2000, 6, config)).toThrow(/2, 3/);
  });

  it("handles a 0% APR config", () => {
    expect(buildHardshipPlan(1000, 3, { ...config, hardship_apr_pct: 0 }).schedule.map((i) => i.amount)).toEqual([333, 333, 334]);
  });
});
