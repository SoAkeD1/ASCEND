import type { InflowRules, InflowTxn } from "./types";

export type ParseResult = {
  txns: InflowTxn[];
  /** Lines we could not read, with a reason, so the user can fix their file. */
  errors: { line: number; reason: string }[];
};

const REQUIRED = ["date", "description", "credit", "debit"] as const;

/** Split one CSV line, respecting double-quoted fields that contain commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY. Returns ISO YYYY-MM-DD or null. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Reject impossible dates such as 31/02/2026, which Date would silently roll over.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Strips commas, ₹ and spaces, e.g. "1,234.50" → 1234.5. Blank → 0. Unreadable → null. */
function parseAmount(raw: string): number | null {
  const s = raw.replace(/[,₹\s]/g, "");
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

export function isBounce(description: string, rules: InflowRules): boolean {
  const d = description.toUpperCase();
  return rules.bounce_keywords.some((k) => d.includes(k.toUpperCase()));
}

/**
 * Parse a bank statement CSV with columns date, description, credit, debit (balance optional).
 * Each line becomes a credit, a debit, or — if its description matches a bounce keyword — a bounce.
 */
export function parseStatementCsv(text: string, rules: InflowRules): ParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const errors: ParseResult["errors"] = [];
  const txns: InflowTxn[] = [];

  const headerIdx = lines.findIndex((l) => l.trim() !== "");
  if (headerIdx === -1) return { txns, errors: [{ line: 1, reason: "The file is empty." }] };

  const header = splitCsvLine(lines[headerIdx]).map((h) => h.toLowerCase());
  const col: Record<string, number> = {};
  for (const name of REQUIRED) {
    const i = header.indexOf(name);
    if (i === -1) {
      return { txns, errors: [{ line: headerIdx + 1, reason: `Missing a "${name}" column.` }] };
    }
    col[name] = i;
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    const cells = splitCsvLine(lines[i]);
    const lineNo = i + 1;

    const date = parseDate(cells[col.date] ?? "");
    if (!date) {
      errors.push({ line: lineNo, reason: "Unreadable date." });
      continue;
    }
    const credit = parseAmount(cells[col.credit] ?? "");
    const debit = parseAmount(cells[col.debit] ?? "");
    if (credit === null || debit === null) {
      errors.push({ line: lineNo, reason: "Unreadable amount." });
      continue;
    }
    const description = cells[col.description] ?? "";

    if (isBounce(description, rules)) {
      txns.push({ date, amount: credit || debit, description, kind: "bounce", source: "csv" });
    } else if (credit > 0 && debit === 0) {
      txns.push({ date, amount: credit, description, kind: "credit", source: "csv" });
    } else if (debit > 0 && credit === 0) {
      txns.push({ date, amount: debit, description, kind: "debit", source: "csv" });
    } else if (credit === 0 && debit === 0) {
      continue; // balance-only line, nothing moved
    } else {
      errors.push({ line: lineNo, reason: "Both credit and debit are filled in." });
    }
  }
  return { txns, errors };
}
