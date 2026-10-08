import type { InflowTxn } from "./types";

export type MonthTotal = { month: string; credits: number };

export type InflowSummary = {
  /** Credit total for every month that has any data, oldest first. */
  months: MonthTotal[];
  /** Mean of the monthly credit totals, rounded to the rupee. 0 when there is no data. */
  avgMonthlyInflow: number;
  /** Number of distinct calendar months with any data. */
  historyMonths: number;
  /** Most recent bounce, ISO date, or null if none. */
  lastBounceDate: string | null;
  /**
   * Usual day of the month the largest credit lands, from real-dated (CSV) rows only.
   * null when it cannot be known, e.g. only manual monthly totals were entered.
   */
  payday: number | null;
};

const monthOf = (isoDate: string) => isoDate.slice(0, 7);
const dayOf = (isoDate: string) => Number(isoDate.slice(8, 10));

/** Turn typed monthly totals into credit rows. They carry no real day, so they never set a payday. */
export function manualEntriesToTxns(entries: { month: string; amount: number }[]): InflowTxn[] {
  return entries.map((e) => ({
    date: `${e.month}-01`,
    amount: e.amount,
    description: "Manual monthly inflow",
    kind: "credit",
    source: "manual",
  }));
}

export function analyseInflow(txns: InflowTxn[]): InflowSummary {
  const byMonth = new Map<string, number>();
  for (const t of txns) {
    const m = monthOf(t.date);
    if (!byMonth.has(m)) byMonth.set(m, 0);
    if (t.kind === "credit") byMonth.set(m, byMonth.get(m)! + t.amount);
  }

  const months = [...byMonth.keys()].sort().map((month) => ({ month, credits: byMonth.get(month)! }));
  const historyMonths = months.length;
  const avgMonthlyInflow = historyMonths
    ? Math.round(months.reduce((sum, m) => sum + m.credits, 0) / historyMonths)
    : 0;

  const bounces = txns.filter((t) => t.kind === "bounce").map((t) => t.date).sort();
  const lastBounceDate = bounces.length ? bounces[bounces.length - 1] : null;

  return { months, avgMonthlyInflow, historyMonths, lastBounceDate, payday: detectPayday(txns) };
}

/**
 * For each month, take the day of its largest CSV credit. Payday is the most common of those days.
 * Ties go to the day seen in the most recent month, since habits change.
 */
function detectPayday(txns: InflowTxn[]): number | null {
  const largest = new Map<string, InflowTxn>();
  for (const t of txns) {
    if (t.kind !== "credit" || t.source !== "csv") continue;
    const m = monthOf(t.date);
    const cur = largest.get(m);
    if (!cur || t.amount > cur.amount) largest.set(m, t);
  }
  if (largest.size === 0) return null;

  const counts = new Map<number, { n: number; lastMonth: string }>();
  for (const [month, t] of largest) {
    const day = dayOf(t.date);
    const c = counts.get(day) ?? { n: 0, lastMonth: "" };
    counts.set(day, { n: c.n + 1, lastMonth: month > c.lastMonth ? month : c.lastMonth });
  }
  let best: { day: number; n: number; lastMonth: string } | null = null;
  for (const [day, c] of counts) {
    if (!best || c.n > best.n || (c.n === best.n && c.lastMonth > best.lastMonth)) {
      best = { day, ...c };
    }
  }
  return best!.day;
}
