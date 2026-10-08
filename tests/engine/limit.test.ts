import { describe, expect, it } from "vitest";
import { chooseLimit, computeOffer } from "@/lib/engine/limit";
import { limitRules } from "../fixtures/config";

describe("computeOffer", () => {
  it("takes 25% of inflow", () => {
    expect(computeOffer(8000, limitRules)).toEqual({ offer: 2000, raw: 2000, clampedBy: null });
  });

  it("rounds DOWN to the nearest step", () => {
    // 25% of 8,390 = 2,097.5 → 2,000, not 2,100
    expect(computeOffer(8390, limitRules).offer).toBe(2000);
  });

  it("never offers less than the minimum", () => {
    expect(computeOffer(2000, limitRules)).toMatchObject({ offer: 1000, clampedBy: "min" });
  });

  it("never offers more than the maximum", () => {
    expect(computeOffer(30000, limitRules)).toMatchObject({ offer: 5000, clampedBy: "max" });
  });

  it("follows the rules it is given, not hard-coded numbers", () => {
    const stricter = { ...limitRules, limit_pct: 20, limit_rounding: 500 };
    expect(computeOffer(8000, stricter).offer).toBe(1500); // 1,600 → down to 1,500
  });

  it("rejects nonsense inflow", () => {
    expect(() => computeOffer(-1, limitRules)).toThrow(RangeError);
    expect(() => computeOffer(Number.NaN, limitRules)).toThrow(RangeError);
  });
});

describe("chooseLimit", () => {
  it("accepts a lower limit", () => {
    expect(chooseLimit(1500, 2000, limitRules)).toBe(1500);
  });

  it("accepts exactly the offer", () => {
    expect(chooseLimit(2000, 2000, limitRules)).toBe(2000);
  });

  it("never allows more than the offer", () => {
    expect(() => chooseLimit(2100, 2000, limitRules)).toThrow(/higher than the offer/);
  });

  it("never allows less than the minimum", () => {
    expect(() => chooseLimit(900, 2000, limitRules)).toThrow(/below the minimum/);
  });

  it("snaps an in-between choice down to the step", () => {
    expect(chooseLimit(1550, 2000, limitRules)).toBe(1500);
  });
});
