import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { withActor, SYSTEM } from "../db/actor";
import { auditLog, otpCodes, users } from "../db/schema";
import { getOtpSender, otpChannel } from "../providers/otp";
import { hit } from "./rateLimit";
import { realToday } from "../clock";

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const SENDS_PER_15_MIN = 5;
const IP_REQUESTS_PER_15_MIN = 30;

const hash = (identifier: string, code: string) =>
  createHmac("sha256", process.env.SESSION_SECRET!).update(`${identifier}:${code}`).digest("hex");

export function normaliseIdentifier(raw: string): string {
  const s = raw.trim();
  return otpChannel() === "email" ? s.toLowerCase() : s.replace(/[^\d+]/g, "");
}

export type RequestResult = { ok: true; sandboxCode?: string } | { ok: false; error: string };

export async function requestOtp(identifier: string, ip: string): Promise<RequestResult> {
  const sender = getOtpSender();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const allowed = await withActor(SYSTEM, async (tx) => {
    if (!(await hit(tx, `otp-send:${identifier}`, SENDS_PER_15_MIN, 15))) return false;
    if (!(await hit(tx, `otp-ip:${ip}`, IP_REQUESTS_PER_15_MIN, 15))) return false;
    await tx.insert(otpCodes).values({
      email: identifier,
      codeHash: hash(identifier, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
    });
    return true;
  });
  if (!allowed) return { ok: false, error: "Too many codes requested. Please wait a few minutes." };
  const sent = await sender.send(identifier, code);
  return { ok: true, sandboxCode: sent.sandboxCode };
}

export type VerifyResult = { ok: true; userId: string; role: "user" | "lender" | "admin"; isNew: boolean } | { ok: false; error: string };

const listed = (envVar: string, identifier: string) =>
  (process.env[envVar] ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(identifier.toLowerCase());

export async function verifyOtp(identifier: string, code: string, ip: string): Promise<VerifyResult> {
  return withActor(SYSTEM, async (tx) => {
    if (!(await hit(tx, `otp-verify-ip:${ip}`, IP_REQUESTS_PER_15_MIN, 15))) return { ok: false, error: "Too many attempts. Please wait a few minutes." };
    const [row] = await tx
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.email, identifier), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);
    if (!row) return { ok: false, error: "That code has expired. Ask for a new one." };
    if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Too many wrong tries. Ask for a new code." };

    const a = Buffer.from(row.codeHash, "hex");
    const b = Buffer.from(hash(identifier, code.trim()), "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await tx.update(otpCodes).set({ attempts: row.attempts + 1 }).where(eq(otpCodes.id, row.id));
      return { ok: false, error: "That code is not right. Check and try again." };
    }
    await tx.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));

    const byEmail = otpChannel() === "email";
    const col = byEmail ? users.email : users.phone;
    const [existing] = await tx.select().from(users).where(and(eq(col, identifier), isNull(users.deletedAt)));
    const role = listed("ADMIN_EMAILS", identifier) ? "admin" : listed("LENDER_EMAILS", identifier) ? "lender" : "user";
    if (existing) {
      if (existing.role !== role && role !== "user") await tx.update(users).set({ role }).where(eq(users.id, existing.id));
      return { ok: true, userId: existing.id, role: role !== "user" ? role : existing.role, isNew: false };
    }
    const [created] = await tx
      .insert(users)
      .values({ ...(byEmail ? { email: identifier } : { phone: identifier }), cohort: realToday().slice(0, 7), role })
      .returning({ id: users.id });
    await tx.insert(auditLog).values({ actor: `user:${created.id}`, action: "signup", entity: `users:${created.id}`, after: { role } });
    return { ok: true, userId: created.id, role, isNew: true };
  });
}
