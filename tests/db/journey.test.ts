import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withActor, SYSTEM } from "@/lib/db/actor";
import { creditLines, cycles, rewards, slipEvents, users, revenueLedger, hardshipPlans } from "@/lib/db/schema";
import * as onb from "@/lib/services/onboarding";
import * as line from "@/lib/services/line";
import * as admin from "@/lib/services/admin";
import { familyView, createFamilyLink, revokeFamilyLink } from "@/lib/services/family";
import { lenderMetrics } from "@/lib/services/lender";
import { sandboxKyc } from "@/lib/providers/sandbox";
import { freshDb } from "../helpers/db";

process.env.DEMO_MODE = "true";
let uid: string;
const asUser = <T,>(fn: Parameters<typeof withActor<T>>[1]) => withActor({ kind: "user", userId: uid }, fn);
const asAdmin = <T,>(fn: Parameters<typeof withActor<T>>[1]) => withActor(SYSTEM, fn);

async function validAadhaar() {
  for (let d = 0; d < 10; d++) {
    const n = `23456789012${d}`;
    if ((await sandboxKyc.verify("ABCDE1234F", n)).ok) return n;
  }
  throw new Error("no checksum digit");
}

const statement = (months: string[]) =>
  ["Date,Description,Credit,Debit,Balance", ...months.map((m) => `${m}-05,POCKET MONEY,8000,,8000`)].join("\n");

beforeAll(async () => {
  await freshDb();
  [{ id: uid }] = await withActor(SYSTEM, (tx) => tx.insert(users).values({ email: "student@example.test", cohort: "2026-10" }).returning({ id: users.id }));
}, 60_000);

describe("a new user's whole journey", () => {
  it("onboards through every gate to an approved offer", async () => {
    await asUser(async (tx) => {
      expect(await onb.nextStep(tx, uid)).toBe("profile");
      expect((await onb.saveProfile(tx, uid, { fullName: "Test Student", dob: "2005-06-01" })).blocked).toBe(false);
      await onb.saveKyc(tx, uid, { pan: "abcde1234f", aadhaar: await validAadhaar() });
      await onb.saveEnrolment(tx, uid, { college: "Test College", course: "BCom", year: 2, method: "id_upload" });
      for (const t of ["kyc", "aa", "bureau"] as const) await onb.setConsent(tx, uid, t, true);
      await onb.saveBureau(tx, uid, { status: "clean", overdueAmount: 0 });
      const up = await onb.uploadStatement(tx, uid, { filename: "s.csv", text: statement(["2026-06", "2026-07", "2026-08", "2026-09"]), keepFile: false });
      expect(up.imported).toBe(4);
      const r = await onb.runUnderwriting(tx, uid);
      expect(r.decision.decision).toBe("approved");
      expect(r.decision.offer!.offer).toBe(2000);
      expect(r.inflow.payday).toBe(5);
    });
  });

  it("chooses a lower limit, accepts the KFS and activates with AutoPay", async () => {
    await asUser(async (tx) => {
      await expect(line.requireLine(tx, uid)).rejects.toThrow();
      await expect(onb.chooseUserLimit(tx, uid, 2500)).rejects.toThrow(/higher than the offer/);
      const kfs = await onb.chooseUserLimit(tx, uid, 1500);
      expect(kfs.limit.chosen).toBe(1500);
      await onb.acceptKfs(tx, uid, kfs.version);
      expect(await onb.suggestedDueDay(tx, uid)).toBe(7);
      await onb.activateLine(tx, uid, { autopayOn: true, dueDay: 7 });
      expect(await onb.nextStep(tx, uid)).toBe("home");
    });
  });

  it("spends, asks to confirm a big spend, and fires the first-spend moment", async () => {
    await asUser(async (tx) => {
      const big = await line.spend(tx, uid, { merchant: "Bookshop", category: "Books", amount: 800, confirmed: false });
      expect(big.needsConfirm).toBe(true);
      const ok = await line.spend(tx, uid, { merchant: "Canteen", category: "Food", amount: 600, confirmed: false });
      expect(ok.needsConfirm).toBe(false);
      if (!ok.needsConfirm) expect(ok.moments).toContain("first_spend");
      await expect(line.spend(tx, uid, { merchant: "X", category: "Food", amount: 1000, confirmed: true })).rejects.toThrow(/more than you have/);
    });
  });

  it("AutoPay pays on the due date: on time, cashback, healthy-account fee", async () => {
    const t = await asAdmin((tx) => admin.timeTravel(tx, "admin", uid, { dueDate: true }));
    expect(t.daysProcessed).toBeGreaterThan(30);
    await asAdmin(async (tx) => {
      const [c1] = await tx.select().from(cycles).where(eq(cycles.n, 1));
      expect(c1).toMatchObject({ status: "settled", onTime: true, statementAmount: 600, paidAmount: 600 });
      expect((await tx.select().from(rewards)).map((r) => r.amount)).toEqual([10]);
      const rev = await tx.select().from(revenueLedger);
      expect(rev.map((r) => r.type).sort()).toEqual(["healthy_account_fee", "interchange"]);
    });
  });

  it("a failed AutoPay walks the slip ladder up to the freeze, then a hardship plan and comeback", async () => {
    await asUser((tx) => line.spend(tx, uid, { merchant: "Canteen", category: "Food", amount: 700, confirmed: true }));
    await asAdmin((tx) => admin.setForceAutopayFail(tx, "admin", uid, true));
    await asAdmin((tx) => admin.timeTravel(tx, "admin", uid, { dpd: 31 }));
    await asAdmin(async (tx) => {
      const [l] = await tx.select().from(creditLines);
      expect(l.status).toBe("frozen");
      const [c1] = await tx.select().from(cycles).where(eq(cycles.n, 1));
      const [c2] = await tx.select().from(cycles).where(eq(cycles.n, 2));
      const events = await tx.select().from(slipEvents);
      // Cycle 1 only got its reminder before AutoPay paid it; cycle 2 climbed to the freeze.
      expect(events.filter((e) => e.cycleId === c1.id).map((e) => e.step)).toEqual([1]);
      expect(events.filter((e) => e.cycleId === c2.id).map((e) => e.step).sort()).toEqual([1, 2, 3, 4, 5]);
      expect(c2.reported).toBe(true);
    });
    await expect(asUser((tx) => line.spend(tx, uid, { merchant: "Y", category: "Food", amount: 10, confirmed: false }))).rejects.toThrow(/not active/);

    const q = await asUser((tx) => line.hardshipQuote(tx, uid));
    expect(q).toMatchObject({ eligible: true, principal: 700 });
    await asUser((tx) => line.startHardshipPlan(tx, uid, 3));
    for (let i = 0; i < 3; i++) await asUser((tx) => line.payInstalment(tx, uid));
    await asAdmin(async (tx) => {
      const [p] = await tx.select().from(hardshipPlans);
      expect(p).toMatchObject({ status: "completed", ascendRevenue: 0 });
      const [l] = await tx.select().from(creditLines);
      expect(l).toMatchObject({ status: "active", currentLimit: 1000, comebackRestoreLimit: 1500 });
    });
  });

  it("the family view never contains amounts, merchants or transactions, and revoking kills it", async () => {
    const link = await asUser((tx) => createFamilyLink(tx, uid, false));
    const view = await asAdmin((tx) => familyView(tx, link.token));
    expect(Object.keys(view!).sort()).toEqual(["cyclesToFirstScore", "firstName", "ladder", "paymentStatus", "scoreStage", "streak"]);
    expect(JSON.stringify(view)).not.toMatch(/amount|merchant|spend|owed|limit|Canteen|700|600/i);
    expect(view!.firstName).toBe("Test");
    await asUser((tx) => revokeFamilyLink(tx, uid, link.id));
    expect(await asAdmin((tx) => familyView(tx, link.token))).toBeNull();
  });

  it("the lender dashboard computes from rows, with late-fee revenue fixed at zero", async () => {
    const m = await asAdmin((tx) => lenderMetrics(tx));
    expect(m.funnel).toMatchObject({ signups: 1, approved: 1, linesOpened: 1 });
    expect(m.lateFeeRevenue).toBe(0);
    expect(m.revenue.map((r) => r.type)).toEqual(["interchange", "healthy_account_fee", "graduation_fee"]);
  });
});
