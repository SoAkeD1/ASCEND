import { describe, expect, it } from "vitest";
import { cashbackFor, lateFee } from "@/lib/engine/rewards";
import { dlgCover, dpdPct, nextBrakeState } from "@/lib/engine/riskBrake";
import { REVENUE_TYPES, graduationFee, healthyAccountFee, interchangeOn } from "@/lib/engine/revenue";
import { momentsToFire } from "@/lib/engine/moments";
import { illustrativeBand, scoreJourney } from "@/lib/engine/score";
import { buildKfs } from "@/lib/engine/kfs";
import { computeOffer } from "@/lib/engine/limit";
import { config } from "../fixtures/config";

describe("rewards", () => {
  it("pays the tier's cashback only for an on-time cycle with enough spend", () => {
    expect(cashbackFor({ onTime: true, cycleSpend: 500, tier: 1 }, config)).toBe(10);
    expect(cashbackFor({ onTime: true, cycleSpend: 500, tier: 3 }, config)).toBe(30);
    expect(cashbackFor({ onTime: true, cycleSpend: 499, tier: 2 }, config)).toBe(0);
    expect(cashbackFor({ onTime: false, cycleSpend: 5000, tier: 2 }, config)).toBe(0);
  });
  it("more spend never earns more cashback", () => {
    expect(cashbackFor({ onTime: true, cycleSpend: 4900, tier: 1 }, config)).toBe(cashbackFor({ onTime: true, cycleSpend: 500, tier: 1 }, config));
  });
  it("late fee always equals config", () => {
    expect(lateFee(config)).toBe(0);
  });
});

describe("revenue", () => {
  it("has no late-fee type", () => {
    expect(REVENUE_TYPES).toEqual(["interchange", "healthy_account_fee", "graduation_fee"]);
    expect(REVENUE_TYPES.some((t) => /late/i.test(t))).toBe(false);
  });
  it("computes each fee from config", () => {
    expect(interchangeOn(80, config)).toBe(0.88);
    expect(healthyAccountFee(true, config)).toBe(20);
    expect(healthyAccountFee(false, config)).toBe(0);
    expect(graduationFee(config)).toBe(500);
  });
});

describe("risk brake", () => {
  const lines = [
    { outstanding: 9600, dpd: 0 },
    { outstanding: 400, dpd: 35 },
  ];
  it("30+ DPD % is weighted by outstanding", () => {
    expect(dpdPct(lines, config)).toBe(4);
    expect(dpdPct([], config)).toBe(0);
  });
  it("brakes, stops and releases with a hold zone in between", () => {
    expect(nextBrakeState(3.5, "none", config)).toBe("brake");
    expect(nextBrakeState(4.5, "brake", config)).toBe("stop");
    expect(nextBrakeState(3, "brake", config)).toBe("brake");
    expect(nextBrakeState(3, "none", config)).toBe("none");
    expect(nextBrakeState(1.9, "stop", config)).toBe("none");
  });
  it("DLG cover respects the cohort cap", () => {
    expect(dlgCover({ unpaid: 800, cohortBook: 100000, usedSoFar: 0 }, config)).toBe(800);
    expect(dlgCover({ unpaid: 800, cohortBook: 100000, usedSoFar: 4500 }, config)).toBe(500);
    expect(dlgCover({ unpaid: 800, cohortBook: 100000, usedSoFar: 5000 }, config)).toBe(0);
  });
});

describe("moments", () => {
  const ctx = { totalSpends: 1, utilisationPct: 10, cycleN: 1, today: "2026-11-05", unpaidDue: null, closedCycles: 0, justClosedCycle: null, justRaisedTo: null };
  it("fires first_spend once", () => {
    expect(momentsToFire(ctx, new Set(), config).map((h) => h.key)).toEqual(["first_spend"]);
    expect(momentsToFire(ctx, new Set(["first_spend"]), config)).toEqual([]);
  });
  it("fires utilisation and due-soon once per cycle / bill", () => {
    const keys = momentsToFire({ ...ctx, utilisationPct: 40, unpaidDue: "2026-11-07" }, new Set(["first_spend"]), config).map((h) => h.key);
    expect(keys).toEqual(["utilisation_cross:1", "due_soon:2026-11-07"]);
  });
  it("only fires triggers enabled in config", () => {
    expect(momentsToFire(ctx, new Set(), { ...config, moment_triggers: [] })).toEqual([]);
  });
});

describe("score", () => {
  it("builds the timeline toward the first score", () => {
    const j = scoreJourney([true, true], config);
    expect(j).toMatchObject({ stage: "building", closedCycles: 2, cyclesToFirstScore: 4 });
    expect(j.timeline).toHaveLength(6);
    expect(scoreJourney([], config).stage).toBe("not_started");
  });
  it("illustrative band rewards on-time and low usage", () => {
    expect(illustrativeBand({ onTimeCycles: 3, lateCycles: 0, utilisationPct: 10 }, config)).toBe("Building");
    expect(illustrativeBand({ onTimeCycles: 6, lateCycles: 0, utilisationPct: 10 }, config)).toBe("Strong");
    expect(illustrativeBand({ onTimeCycles: 6, lateCycles: 0, utilisationPct: 60 }, config)).toBe("Good");
    expect(illustrativeBand({ onTimeCycles: 5, lateCycles: 1, utilisationPct: 10 }, config)).toBe("Fair");
  });
});

describe("kfs", () => {
  const kfs = buildKfs(
    { version: 1, today: "2026-10-09", chosenLimit: 2000, offer: computeOffer(8000, config), avgMonthlyInflow: 8000, consents: [] },
    config,
  );
  it("reads every fee from config and costs ₹0 when paid on time", () => {
    expect(kfs.fees).toEqual({ processing: 0, annual: 0, late: 0, foreclosure: 0 });
    expect(kfs.totalCostOfCredit.total).toBe(0);
    expect(kfs.interest.aprOnTimePct).toBe(0);
  });
  it("includes a worked hardship example per month option on the chosen limit", () => {
    expect(kfs.hardship.examples.map((e) => [e.principal, e.months])).toEqual([
      [2000, 2],
      [2000, 3],
    ]);
  });
  it("dates cooling-off and slip steps from config", () => {
    expect(kfs.coolingOff.until).toBe("2026-10-12");
    expect(kfs.slip.find((s) => s.step === 5)!.dayFromDue).toBe(31);
  });
  it("changes with config, no code change", () => {
    const k = buildKfs({ version: 1, today: "2026-10-09", chosenLimit: 2000, offer: computeOffer(8000, config), avgMonthlyInflow: 8000, consents: [] }, { ...config, processing_fee: 50 });
    expect(k.totalCostOfCredit.total).toBe(50);
  });
});
