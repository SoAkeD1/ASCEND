import { describe, expect, it } from "vitest";
import { underwrite, builderProgress, bounceClearsOn } from "@/lib/engine/underwriting";
import type { InflowSummary } from "@/lib/engine/inflow";
import { config } from "../fixtures/config";

const today = "2026-10-09";
const goodInflow: InflowSummary = {
  months: [],
  avgMonthlyInflow: 8000,
  historyMonths: 4,
  lastBounceDate: null,
  payday: 5,
};
const base = { dob: "2005-01-01", today, bureau: { status: "clean" as const, overdueAmount: 0 }, inflow: goodInflow };

describe("underwrite", () => {
  it("approves and offers 25% of inflow", () => {
    const d = underwrite(base, config);
    expect(d.decision).toBe("approved");
    expect(d.offer!.offer).toBe(2000);
    expect(d.gate2).toEqual({ inflowOk: true, historyOk: true, bounceOk: true });
  });

  it("blocks under-18s and gives their own 18th birthday as the come-back date", () => {
    const d = underwrite({ ...base, dob: "2009-03-15" }, config);
    expect(d).toMatchObject({ decision: "age_block", reasonKey: "under_age", actualValue: 17, requiredValue: 18, recheckAt: "2027-03-15" });
  });

  it("lets someone in on their 18th birthday exactly", () => {
    expect(underwrite({ ...base, dob: "2008-10-09" }, config).decision).toBe("approved");
  });

  it("Gate 1: an active default goes to Builder with the overdue amount", () => {
    const d = underwrite({ ...base, bureau: { status: "active_default", overdueAmount: 3200 } }, config);
    expect(d).toMatchObject({ decision: "builder", reasonKey: "active_default", actualValue: 3200, requiredValue: 0, gate1Pass: false, recheckAt: "2026-12-08" });
  });

  it.each(["none", "thin", "clean"] as const)("Gate 1: bureau '%s' passes", (status) => {
    expect(underwrite({ ...base, bureau: { status, overdueAmount: 0 } }, config).gate1Pass).toBe(true);
  });

  it("Gate 2: low inflow reports actual vs required", () => {
    const d = underwrite({ ...base, inflow: { ...goodInflow, avgMonthlyInflow: 3500 } }, config);
    expect(d).toMatchObject({ decision: "builder", reasonKey: "low_inflow", actualValue: 3500, requiredValue: 4000 });
  });

  it("Gate 2: short history", () => {
    const d = underwrite({ ...base, inflow: { ...goodInflow, historyMonths: 2 } }, config);
    expect(d).toMatchObject({ reasonKey: "short_history", actualValue: 2, requiredValue: 3 });
  });

  it("Gate 2: a bounce inside the window fails, with days since it", () => {
    const d = underwrite({ ...base, inflow: { ...goodInflow, lastBounceDate: "2026-09-09" } }, config);
    expect(d).toMatchObject({ reasonKey: "recent_bounce", actualValue: 30, requiredValue: 90 });
  });

  it("Gate 2: a bounce exactly at the window edge still counts; one day later it does not", () => {
    expect(underwrite({ ...base, inflow: { ...goodInflow, lastBounceDate: "2026-07-11" } }, config).reasonKey).toBe("recent_bounce");
    expect(underwrite({ ...base, inflow: { ...goodInflow, lastBounceDate: "2026-07-10" } }, config).decision).toBe("approved");
  });

  it("reports the FIRST failing check when several fail", () => {
    const d = underwrite({ ...base, inflow: { ...goodInflow, avgMonthlyInflow: 100, historyMonths: 1 } }, config);
    expect(d.reasonKey).toBe("low_inflow");
    expect(d.gate2).toEqual({ inflowOk: false, historyOk: false, bounceOk: true });
  });

  it("changing a config value changes the decision without code changes", () => {
    const d = underwrite({ ...base, inflow: { ...goodInflow, avgMonthlyInflow: 3500 } }, { ...config, min_inflow: 3000 });
    expect(d.decision).toBe("approved");
  });
});

describe("builder helpers", () => {
  it("progress is actual over required, capped at 1", () => {
    expect(builderProgress("low_inflow", 3000, 4000)).toBe(0.75);
    expect(builderProgress("short_history", 5, 3)).toBe(1);
    expect(builderProgress("active_default", 3200, 0)).toBe(0);
  });
  it("a bounce clears the day after the window ends", () => {
    expect(bounceClearsOn("2026-09-09", config)).toBe("2026-12-09");
  });
});
