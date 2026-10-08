import { z } from "zod";
import type { Tx } from "../db";
import type { Session } from "../auth/session";
import { isIsoDate } from "../engine/dates";
import * as onb from "../services/onboarding";
import * as line from "../services/line";
import * as family from "../services/family";
import * as account from "../services/account";
import * as admin from "../services/admin";
import { recomputeBrakes } from "../services/daily";
import { testMerchants } from "../db/schema";

/**
 * EVERY action the app can perform, in one table: who may call it, the exact shape its input must
 * have (checked by Zod before anything runs), and the service function it calls.
 * The dispatcher in app/api/[...path]/route.ts runs each one inside withActor, so Row Level
 * Security applies to all of them.
 */
type Who = "user" | "lender" | "admin" | "public";
type Handler<S extends z.ZodTypeAny> = {
  who: Who[];
  input: S;
  /** Run the daily catch-up for this user first, so money actions see today's state. */
  catchUp?: boolean;
  run: (tx: Tx, s: Session | null, input: z.infer<S>, params: string[]) => Promise<unknown>;
};
const h = <S extends z.ZodTypeAny>(x: Handler<S>) => x;

const isoDate = z.string().refine(isIsoDate, "must be a date like 2005-06-01");
const rupees = z.number().int().positive().max(10_000_000);
const none = z.object({}).strict();
const uid = (s: Session | null) => s!.userId;
const who = (s: Session | null) => `${s!.role}:${s!.userId}`;

export const ROUTES: Record<string, Handler<z.ZodTypeAny>> = {
  // ---------- onboarding ----------
  "POST onboarding/profile": h({
    who: ["user", "admin", "lender"],
    input: z.object({ fullName: z.string().trim().min(2).max(80), dob: isoDate }),
    run: (tx, s, i) => onb.saveProfile(tx, uid(s), i),
  }),
  "POST onboarding/kyc": h({
    who: ["user", "admin", "lender"],
    input: z.object({ pan: z.string().min(10).max(10), aadhaar: z.string().min(12).max(14) }),
    run: (tx, s, i) => onb.saveKyc(tx, uid(s), i),
  }),
  "POST onboarding/enrolment": h({
    who: ["user", "admin", "lender"],
    input: z.object({
      college: z.string().trim().min(2).max(120),
      course: z.string().trim().min(2).max(80),
      year: z.number().int().min(1).max(7),
      method: z.enum(["id_upload", "college_email"]),
    }),
    run: (tx, s, i) => onb.saveEnrolment(tx, uid(s), i),
  }),
  "POST consents": h({
    who: ["user", "admin", "lender"],
    input: z.object({ type: z.enum(["kyc", "aa", "bureau", "family_share"]), granted: z.boolean() }),
    run: (tx, s, i) => onb.setConsent(tx, uid(s), i.type, i.granted),
  }),
  "POST onboarding/bureau": h({
    who: ["user", "admin", "lender"],
    input: z.object({ status: z.enum(["none", "thin", "clean", "active_default"]), overdueAmount: z.number().int().min(0).max(10_000_000) }),
    run: (tx, s, i) => onb.saveBureau(tx, uid(s), i),
  }),
  "POST onboarding/statement": h({
    who: ["user", "admin", "lender"],
    input: z.object({ filename: z.string().max(200), text: z.string().max(2_000_000), keepFile: z.boolean() }),
    run: (tx, s, i) => onb.uploadStatement(tx, uid(s), i),
  }),
  "POST onboarding/manual": h({
    who: ["user", "admin", "lender"],
    input: z.object({ entries: z.array(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), amount: z.number().int().min(0).max(10_000_000) })).max(24) }),
    run: (tx, s, i) => onb.saveManualInflow(tx, uid(s), i.entries),
  }),
  "POST onboarding/underwrite": h({ who: ["user", "admin", "lender"], input: none, run: (tx, s) => onb.runUnderwriting(tx, uid(s)) }),
  "POST onboarding/limit": h({
    who: ["user", "admin", "lender"],
    input: z.object({ amount: rupees }),
    run: (tx, s, i) => onb.chooseUserLimit(tx, uid(s), i.amount),
  }),
  "POST onboarding/kfs/accept": h({
    who: ["user", "admin", "lender"],
    input: z.object({ version: z.number().int().positive() }),
    run: (tx, s, i) => onb.acceptKfs(tx, uid(s), i.version),
  }),
  "POST onboarding/activate": h({
    who: ["user", "admin", "lender"],
    input: z.object({ autopayOn: z.boolean(), dueDay: z.number().int().min(1).max(31) }),
    run: (tx, s, i) => onb.activateLine(tx, uid(s), i),
  }),

  // ---------- the line ----------
  "POST line/spend": h({
    who: ["user", "admin", "lender"],
    catchUp: true,
    input: z.object({ merchant: z.string().trim().min(1).max(80), category: z.string().trim().min(1).max(40), amount: rupees, confirmed: z.boolean() }),
    run: (tx, s, i) => line.spend(tx, uid(s), i),
  }),
  "POST line/repay": h({ who: ["user", "admin", "lender"], catchUp: true, input: none, run: (tx, s) => line.repayAll(tx, uid(s)) }),
  "POST line/hardship": h({
    who: ["user", "admin", "lender"],
    catchUp: true,
    input: z.object({ months: z.number().int().positive() }),
    run: (tx, s, i) => line.startHardshipPlan(tx, uid(s), i.months),
  }),
  "POST line/hardship/pay": h({ who: ["user", "admin", "lender"], catchUp: true, input: none, run: (tx, s) => line.payInstalment(tx, uid(s)) }),
  "POST line/settings": h({
    who: ["user", "admin", "lender"],
    input: z.object({ autopayOn: z.boolean().optional(), dueDay: z.number().int().min(1).max(31).optional(), selfFrozen: z.boolean().optional() }),
    run: async (tx, s, i) => {
      if (i.autopayOn !== undefined) await line.setAutopay(tx, uid(s), i.autopayOn);
      if (i.dueDay !== undefined) await line.setDueDay(tx, uid(s), i.dueDay);
      if (i.selfFrozen !== undefined) await line.setSelfFreeze(tx, uid(s), i.selfFrozen);
      return { ok: true };
    },
  }),
  "POST line/cooling-exit": h({ who: ["user", "admin", "lender"], catchUp: true, input: none, run: (tx, s) => line.exitCoolingOff(tx, uid(s)) }),

  // ---------- family, moments, account ----------
  "POST family": h({
    who: ["user", "admin", "lender"],
    input: z.object({ showAttentionFlag: z.boolean() }),
    run: (tx, s, i) => family.createFamilyLink(tx, uid(s), i.showAttentionFlag),
  }),
  "PATCH family/:id": h({
    who: ["user", "admin", "lender"],
    input: z.object({ showAttentionFlag: z.boolean() }),
    run: (tx, s, i, [id]) => family.setAttentionFlag(tx, uid(s), z.string().uuid().parse(id), i.showAttentionFlag),
  }),
  "DELETE family/:id": h({ who: ["user", "admin", "lender"], input: none, run: (tx, s, _i, [id]) => family.revokeFamilyLink(tx, uid(s), z.string().uuid().parse(id)) }),
  "GET family/view/:token": h({
    who: ["public"],
    input: none,
    run: async (tx, _s, _i, [token]) => (await family.familyView(tx, token)) ?? { error: "This link is not active." },
  }),
  "POST moments/:id/seen": h({ who: ["user", "admin", "lender"], input: none, run: (tx, s, _i, [id]) => account.markMomentShown(tx, uid(s), z.string().uuid().parse(id)) }),
  "POST grievances": h({
    who: ["user", "admin", "lender"],
    input: z.object({ subject: z.string().trim().min(3).max(120), body: z.string().trim().min(10).max(4000) }),
    run: (tx, s, i) => account.submitGrievance(tx, uid(s), i.subject, i.body),
  }),
  "POST account/delete": h({ who: ["user", "admin", "lender"], catchUp: true, input: z.object({ confirm: z.literal("DELETE") }), run: (tx, s) => account.deleteMyData(tx, uid(s)) }),

  // ---------- sandbox payee ----------
  "POST test-merchant": h({
    who: ["public"],
    input: z.object({ name: z.string().trim().min(2).max(60), category: z.string().trim().min(2).max(40), amount: rupees.nullable() }),
    run: async (tx, _s, i) => (await tx.insert(testMerchants).values(i).returning())[0],
  }),

  // ---------- admin ----------
  "PUT admin/config": h({
    who: ["admin"],
    input: z.object({ key: z.string(), value: z.unknown() }),
    run: (tx, s, i) => admin.updateConfig(tx, who(s), i.key, i.value),
  }),
  "POST admin/brakes": h({ who: ["admin", "lender"], input: none, run: (tx) => recomputeBrakes(tx) }),
  "POST admin/demo/user": h({
    who: ["admin"],
    input: z.object({
      fullName: z.string().trim().min(2).max(80),
      dob: isoDate,
      monthlyInflows: z.array(z.number().int().min(0).max(10_000_000)).max(24),
      bounce: z.boolean(),
      overdueAmount: z.number().int().positive().nullable(),
    }),
    run: (tx, s, i) => admin.createTestUser(tx, who(s), i),
  }),
  "POST admin/demo/time": h({
    who: ["admin"],
    input: z.object({
      userId: z.string().uuid(),
      days: z.number().int().positive().max(400).optional(),
      cycles: z.number().int().positive().max(24).optional(),
      dueDate: z.boolean().optional(),
      dpd: z.number().int().min(0).max(400).optional(),
    }),
    run: (tx, s, { userId, ...to }) => admin.timeTravel(tx, who(s), userId, to),
  }),
  "POST admin/demo/autopay-fail": h({
    who: ["admin"],
    input: z.object({ userId: z.string().uuid(), on: z.boolean() }),
    run: (tx, s, i) => admin.setForceAutopayFail(tx, who(s), i.userId, i.on),
  }),
  "POST admin/demo/mark-paid": h({ who: ["admin"], input: z.object({ userId: z.string().uuid() }), run: (tx, s, i) => admin.markPaid(tx, who(s), i.userId) }),
  "POST admin/demo/inject-dpd": h({
    who: ["admin"],
    input: z.object({ cohort: z.string().regex(/^\d{4}-\d{2}$/), pctPoints: z.number().min(0).max(100) }),
    run: (tx, s, i) => admin.injectCohortDpd(tx, who(s), i.cohort, i.pctPoints),
  }),
  "POST admin/demo/reset": h({ who: ["admin"], input: none, run: (tx, s) => admin.resetDemo(tx, who(s)) }),
};

/** Match "POST family/3f2…" against "POST family/:id" and return the captured params. */
export function matchRoute(method: string, path: string[]): { key: string; params: string[] } | null {
  for (const key of Object.keys(ROUTES)) {
    const [m, pattern] = key.split(" ");
    if (m !== method) continue;
    const parts = pattern.split("/");
    if (parts.length !== path.length) continue;
    const params: string[] = [];
    if (parts.every((p, i) => (p.startsWith(":") ? (params.push(path[i]), true) : p === path[i]))) return { key, params };
  }
  return null;
}
