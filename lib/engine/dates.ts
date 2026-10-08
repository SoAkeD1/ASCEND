/**
 * Calendar-date helpers. Engines work in ISO dates ("YYYY-MM-DD") so that time zones can never
 * move a due date by a day. All arithmetic is done in UTC.
 */
export type IsoDate = string;

const toUtc = (d: IsoDate) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromUtc = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

export const addDays = (d: IsoDate, n: number): IsoDate => fromUtc(toUtc(d) + n * DAY);

/** Whole days from a to b (positive when b is later). */
export const daysBetween = (a: IsoDate, b: IsoDate): number => Math.round((toUtc(b) - toUtc(a)) / DAY);

export const daysInMonth = (year: number, month1: number) => new Date(Date.UTC(year, month1, 0)).getUTCDate();

/** The given day of the month, clamped to the month's length (31 in February → 28/29). */
export function dateInMonth(year: number, month1: number, day: number): IsoDate {
  const d = Math.min(day, daysInMonth(year, month1));
  return `${year}-${String(month1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** First date on or after `from` whose day-of-month is `day` (clamped for short months). */
export function nextDayOfMonth(from: IsoDate, day: number): IsoDate {
  let [y, m] = from.split("-").map(Number);
  for (let i = 0; i < 3; i++) {
    const candidate = dateInMonth(y, m, day);
    if (candidate >= from) return candidate;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  throw new Error("unreachable");
}

/** Same calendar date `years` later; 29 Feb becomes 28 Feb in a non-leap year. */
export function addYears(d: IsoDate, years: number): IsoDate {
  const [y, m, day] = d.split("-").map(Number);
  return dateInMonth(y + years, m, day);
}

/** Completed years of age on `today`. */
export function ageOn(dob: IsoDate, today: IsoDate): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUtc(toUtc(s)) === s;
