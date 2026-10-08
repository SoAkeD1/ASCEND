/**
 * Sandbox providers. Each runs ONLY on data the user supplies and has the same shape a real
 * provider (DigiLocker, an Account Aggregator, a credit bureau, NPCI UPI, an e-mandate) would have.
 */
import { randomBytes } from "node:crypto";

export const SANDBOX_LABEL = "Sandbox · simulated provider";

// ---------- KycProvider (real: DigiLocker) ----------
export interface KycProvider {
  name: string;
  verify(pan: string, aadhaar: string): Promise<{ ok: true; panLast4: string; aadhaarLast4: string } | { ok: false; reason: string }>;
}

/** Verhoeff checksum, which every real Aadhaar number satisfies. */
export function verhoeffValid(num: string): boolean {
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  let c = 0;
  num.split("").reverse().forEach((ch, i) => {
    c = d[c][p[i % 8][Number(ch)]];
  });
  return c === 0;
}

export const sandboxKyc: KycProvider = {
  name: "sandbox-digilocker",
  async verify(pan, aadhaar) {
    const P = pan.trim().toUpperCase();
    const A = aadhaar.replace(/\s/g, "");
    // Sandbox: any 10 letters or digits. (A real PAN is 5 letters, 4 digits, 1 letter, e.g. ABCDE1234F.)
    if (!/^[A-Z0-9]{10}$/.test(P)) return { ok: false, reason: "PAN should be 10 letters or digits." };
    // Sandbox: any 12 digits are accepted. (A real provider would also reject numbers starting with
    // 0/1 and numbers failing the Verhoeff checksum; verhoeffValid above is kept for that.)
    if (!/^[0-9]{12}$/.test(A)) return { ok: false, reason: "Aadhaar should be 12 digits." };
    // Only the last 4 characters ever leave this function.
    return { ok: true, panLast4: P.slice(-4), aadhaarLast4: A.slice(-4) };
  },
};

// ---------- BureauProvider (real: CIBIL / Experian) ----------
export const BUREAU_SANDBOX_LABEL = "self-declared (sandbox)";

// ---------- UpiProvider (real: NPCI via a PSP bank) ----------
export interface UpiProvider {
  pay(merchant: string, amount: number): Promise<{ ok: true; ref: string } | { ok: false; reason: string }>;
}
export const sandboxUpi: UpiProvider = {
  async pay() {
    return { ok: true, ref: "SBX" + randomBytes(6).toString("hex").toUpperCase() };
  },
};

// ---------- AutopayProvider (real: UPI AutoPay / e-NACH mandate) ----------
export interface AutopayProvider {
  debit(amount: number, opts: { forceFail: boolean }): Promise<{ ok: boolean; reason?: string }>;
}
export const sandboxAutopay: AutopayProvider = {
  async debit(_amount, { forceFail }) {
    return forceFail ? { ok: false, reason: "Simulated failure (demo tool)." } : { ok: true };
  },
};
