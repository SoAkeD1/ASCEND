import { describe, expect, it } from "vitest";
import { checkSpend, cycleWindow, dueDayFromPayday, isOnTime, utilisation } from "@/lib/engine/cycle";
import { ageOn, nextDayOfMonth } from "@/lib/engine/dates";
import { config } from "../fixtures/config";

describe("dates", () => {
  it("clamps a due day of 31 to the end of a short month", () => {
    expect(nextDayOfMonth("2027-02-10", 31)).toBe("2027-02-28");
  });
  it("counts age in completed years", () => {
    expect(ageOn("2008-10-10", "2026-10-09")).toBe(17);
    expect(ageOn("2008-10-09", "2026-10-09")).toBe(18);
  });
});

describe("cycle", () => {
  it("due day is payday + offset, wrapping past 31", () => {
    expect(dueDayFromPayday(5, config)).toBe(7);
    expect(dueDayFromPayday(30, config)).toBe(1);
  });

  it("builds a window: 30 days, due on the due day at least reminder_before_days after the statement", () => {
    expect(cycleWindow("2026-10-09", 7, config)).toEqual({ start: "2026-10-09", end: "2026-11-08", due: "2026-12-07" });
    expect(cycleWindow("2026-10-01", 7, config)).toEqual({ start: "2026-10-01", end: "2026-10-31", due: "2026-11-07" });
  });

  it("rejects spends on an inactive line or above available", () => {
    const line = { currentLimit: 2000, outstanding: 1500, status: "active" as const };
    expect(checkSpend({ ...line, amount: 600 }, config)).toEqual({ ok: false, reason: "over_available" });
    expect(checkSpend({ ...line, amount: 100, status: "paused" }, config)).toEqual({ ok: false, reason: "line_not_active" });
    expect(checkSpend({ ...line, amount: 0 }, config)).toEqual({ ok: false, reason: "invalid_amount" });
  });

  it("asks for confirmation above big_spend_confirm_pct of the limit", () => {
    const line = { currentLimit: 2000, outstanding: 0, status: "active" as const };
    expect(checkSpend({ ...line, amount: 1000 }, config)).toEqual({ ok: true, needsConfirm: false });
    expect(checkSpend({ ...line, amount: 1001 }, config)).toEqual({ ok: true, needsConfirm: true });
  });

  it("turns the meter amber above the nudge line", () => {
    expect(utilisation(600, 2000, config)).toEqual({ pct: 30, amber: false });
    expect(utilisation(620, 2000, config)).toEqual({ pct: 31, amber: true });
  });

  it("on time means paid in full by the due date", () => {
    expect(isOnTime(800, 800, "2026-11-07", "2026-11-07")).toBe(true);
    expect(isOnTime(800, 800, "2026-11-08", "2026-11-07")).toBe(false);
    expect(isOnTime(800, 700, "2026-11-01", "2026-11-07")).toBe(false);
    expect(isOnTime(0, 0, null, "2026-11-07")).toBe(true);
  });
});
