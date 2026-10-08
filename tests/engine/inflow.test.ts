import { describe, expect, it } from "vitest";
import { parseDate, parseStatementCsv } from "@/lib/engine/statementCsv";
import { analyseInflow, manualEntriesToTxns } from "@/lib/engine/inflow";
import type { InflowTxn } from "@/lib/engine/types";
import { inflowRules } from "../fixtures/config";

const credit = (date: string, amount: number): InflowTxn => ({
  date,
  amount,
  description: "UPI CR",
  kind: "credit",
  source: "csv",
});
const debit = (date: string, amount: number): InflowTxn => ({
  date,
  amount,
  description: "UPI DR",
  kind: "debit",
  source: "csv",
});

describe("parseDate", () => {
  it("reads the three common formats", () => {
    expect(parseDate("2026-05-05")).toBe("2026-05-05");
    expect(parseDate("05/05/2026")).toBe("2026-05-05");
    expect(parseDate("5-5-2026")).toBe("2026-05-05");
  });
  it("rejects impossible dates instead of rolling them over", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});

describe("parseStatementCsv", () => {
  it("reads a typical statement with any header case and quoted amounts", () => {
    const csv = [
      "Date,Description,Credit,Debit,Balance",
      '05/05/2026,POCKET MONEY FROM DAD,"8,000.00",,8000',
      "07/05/2026,UPI-CHAI,,80,7920",
    ].join("\n");
    const { txns, errors } = parseStatementCsv(csv, inflowRules);
    expect(errors).toEqual([]);
    expect(txns).toEqual([
      { date: "2026-05-05", amount: 8000, description: "POCKET MONEY FROM DAD", kind: "credit", source: "csv" },
      { date: "2026-05-07", amount: 80, description: "UPI-CHAI", kind: "debit", source: "csv" },
    ]);
  });

  it("marks bounces by keyword, whatever the case", () => {
    const csv = "date,description,credit,debit\n12/03/2026,Mandate return - insufficient funds,,500";
    expect(parseStatementCsv(csv, inflowRules).txns[0].kind).toBe("bounce");
  });

  it("reports bad lines instead of hiding them", () => {
    const csv = ["date,description,credit,debit", "31/02/2026,X,100,", "01/03/2026,Y,abc,", "02/03/2026,Z,10,10"].join("\n");
    expect(parseStatementCsv(csv, inflowRules).errors).toEqual([
      { line: 2, reason: "Unreadable date." },
      { line: 3, reason: "Unreadable amount." },
      { line: 4, reason: "Both credit and debit are filled in." },
    ]);
  });

  it("says which column is missing", () => {
    expect(parseStatementCsv("date,description,credit\n", inflowRules).errors[0].reason).toBe('Missing a "debit" column.');
  });

  it("handles an empty file", () => {
    expect(parseStatementCsv("", inflowRules).errors[0].reason).toBe("The file is empty.");
  });
});

describe("analyseInflow", () => {
  it("averages monthly credit totals and counts history months", () => {
    const s = analyseInflow([
      credit("2026-03-05", 7000),
      credit("2026-04-05", 8000),
      credit("2026-04-20", 1000),
      credit("2026-05-05", 8000),
      debit("2026-05-06", 600),
    ]);
    expect(s.months).toEqual([
      { month: "2026-03", credits: 7000 },
      { month: "2026-04", credits: 9000 },
      { month: "2026-05", credits: 8000 },
    ]);
    expect(s.avgMonthlyInflow).toBe(8000);
    expect(s.historyMonths).toBe(3);
  });

  it("counts a month with only spending as a zero-inflow month", () => {
    const s = analyseInflow([credit("2026-03-05", 6000), debit("2026-04-10", 200)]);
    expect(s.historyMonths).toBe(2);
    expect(s.avgMonthlyInflow).toBe(3000);
  });

  it("finds the most recent bounce and does not count it as inflow", () => {
    const bounce = (date: string): InflowTxn => ({ date, amount: 500, description: "RETURN", kind: "bounce", source: "csv" });
    const s = analyseInflow([credit("2026-05-05", 8000), bounce("2026-02-10"), bounce("2026-04-12")]);
    expect(s.lastBounceDate).toBe("2026-04-12");
    expect(s.months.find((m) => m.month === "2026-05")!.credits).toBe(8000);
  });

  it("detects payday as the usual day of the largest credit", () => {
    const s = analyseInflow([
      credit("2026-03-05", 8000),
      credit("2026-03-20", 500),
      credit("2026-04-05", 8000),
      credit("2026-05-06", 8000),
    ]);
    expect(s.payday).toBe(5);
  });

  it("breaks a payday tie toward the most recent month", () => {
    const s = analyseInflow([credit("2026-04-05", 8000), credit("2026-05-10", 8000)]);
    expect(s.payday).toBe(10);
  });

  it("never invents a payday from typed monthly totals", () => {
    const s = analyseInflow(manualEntriesToTxns([{ month: "2026-04", amount: 8000 }, { month: "2026-05", amount: 8000 }]));
    expect(s.avgMonthlyInflow).toBe(8000);
    expect(s.historyMonths).toBe(2);
    expect(s.payday).toBeNull();
  });

  it("returns honest empties when there is no data", () => {
    expect(analyseInflow([])).toEqual({ months: [], avgMonthlyInflow: 0, historyMonths: 0, lastBounceDate: null, payday: null });
  });
});
