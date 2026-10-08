import { describe, expect, it } from "vitest";
import { cleanStreak, comebackLimit, comebackRestored, evaluateLadder, ladderPreview, repaymentHistory, tierFor } from "@/lib/engine/ladder";
import { config } from "../fixtures/config";

const healthy = { streak: 0, baseLimit: 2000, currentLimit: 2000, status: "active" as const, brake: "none" as const, latestInflow: 8000 };

describe("repaymentHistory", () => {
  const cy = (n: number, status: "open" | "billed" | "settled", statement: number | null, onTime: boolean | null, due: string) => ({ n, status, statement, onTime, due });
  it("treats ₹0 cycles as neutral and an overdue bill as a miss, in cycle order", () => {
    const h = repaymentHistory(
      [cy(3, "settled", 0, true, "2027-01-07"), cy(1, "billed", 700, null, "2026-12-07"), cy(2, "settled", 0, true, "2026-12-07"), cy(4, "open", null, null, "2027-02-07")],
      "2027-01-07",
    );
    expect(h).toEqual([false]);
    expect(cleanStreak(h)).toBe(0);
  });
  it("leaves a bill that isn't due yet out of the record", () => {
    expect(repaymentHistory([cy(1, "settled", 600, true, "2026-12-07"), cy(2, "billed", 300, null, "2027-01-07")], "2027-01-03")).toEqual([true]);
  });
});

describe("ladder", () => {
  it("counts only the unbroken run of on-time cycles at the end", () => {
    expect(cleanStreak([true, false, true, true])).toBe(2);
    expect(cleanStreak([true, true, false])).toBe(0);
    expect(cleanStreak([])).toBe(0);
  });

  it("previews the rungs from the user's own base limit", () => {
    expect(ladderPreview(2000, config)).toEqual([
      { cycles: 3, limit: 3000, graduate: false },
      { cycles: 6, limit: 4000, graduate: false },
      { cycles: 12, limit: null, graduate: true },
    ]);
  });

  it("caps raised limits at ladder_max", () => {
    expect(ladderPreview(6000, config)[1].limit).toBe(10000);
  });

  it("does nothing before the first threshold, and says how far away it is", () => {
    const r = evaluateLadder({ ...healthy, streak: 2 }, config);
    expect(r.action).toBe("none");
    expect(r.next).toMatchObject({ cycles: 3, remaining: 1 });
  });

  it.each([
    [3, 3000],
    [6, 4000],
  ])("unlocks at %i clean cycles → ₹%i", (streak, limit) => {
    expect(evaluateLadder({ ...healthy, streak }, config)).toMatchObject({ action: "raise", toLimit: limit });
  });

  it("does not raise twice for the same rung", () => {
    expect(evaluateLadder({ ...healthy, streak: 4, currentLimit: 3000 }, config).action).toBe("none");
  });

  it("graduates at the graduate threshold", () => {
    expect(evaluateLadder({ ...healthy, streak: 12, currentLimit: 4000 }, config).action).toBe("graduate");
  });

  it("is blocked by the cohort brake", () => {
    expect(evaluateLadder({ ...healthy, streak: 3, brake: "brake" }, config)).toMatchObject({ action: "blocked", blockedBy: "brake", toLimit: 2000 });
  });

  it("is blocked when the line is not active", () => {
    expect(evaluateLadder({ ...healthy, streak: 3, status: "paused" }, config).blockedBy).toBe("inactive");
  });

  it("is blocked when the latest inflow is below the minimum", () => {
    expect(evaluateLadder({ ...healthy, streak: 3, latestInflow: 3000 }, config).blockedBy).toBe("low_inflow");
  });

  it("follows a config change with no code change", () => {
    const ladder = [{ cycles: 2, mult: 3 }];
    expect(evaluateLadder({ ...healthy, streak: 2 }, { ...config, ladder })).toMatchObject({ action: "raise", toLimit: 6000 });
  });

  it("tier counts multiplier rungs reached", () => {
    expect([0, 3, 6, 12].map((s) => tierFor(s, config))).toEqual([1, 2, 3, 3]);
  });

  it("comeback restarts at limit_min and restores after comeback_cycles", () => {
    expect(comebackLimit(3000, config)).toBe(1000);
    expect(comebackRestored(2, config)).toBe(false);
    expect(comebackRestored(3, config)).toBe(true);
  });
});
