import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Tx } from "../db";
import { creditLines, cycles, familyLinks, users } from "../db/schema";
import { getConfig } from "../config";
import { cleanStreak, ladderPreview } from "../engine/ladder";
import { scoreJourney } from "../engine/score";
import { audit, historyOf, UserError } from "./common";
import { todayFor } from "../clock";
import { setConsent } from "./onboarding";

export async function listFamilyLinks(tx: Tx, userId: string) {
  return tx.select().from(familyLinks).where(eq(familyLinks.userId, userId)).orderBy(desc(familyLinks.createdAt));
}

export async function createFamilyLink(tx: Tx, userId: string, showAttentionFlag: boolean) {
  await setConsent(tx, userId, "family_share", true);
  const token = randomBytes(24).toString("base64url");
  const [link] = await tx.insert(familyLinks).values({ userId, token, showAttentionFlag }).returning();
  await audit(tx, `user:${userId}`, "family_link_created", `family_links:${link.id}`, null, { showAttentionFlag });
  return link;
}

export async function setAttentionFlag(tx: Tx, userId: string, linkId: string, on: boolean) {
  const r = await tx.update(familyLinks).set({ showAttentionFlag: on }).where(and(eq(familyLinks.id, linkId), eq(familyLinks.userId, userId))).returning();
  if (!r.length) throw new UserError("Link not found.", 404);
}

/** Revoking kills access at once: the public page checks revoked_at on every request. */
export async function revokeFamilyLink(tx: Tx, userId: string, linkId: string) {
  const r = await tx
    .update(familyLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(familyLinks.id, linkId), eq(familyLinks.userId, userId), isNull(familyLinks.revokedAt)))
    .returning();
  if (!r.length) throw new UserError("Link not found or already revoked.", 404);
  const active = await tx.select().from(familyLinks).where(and(eq(familyLinks.userId, userId), isNull(familyLinks.revokedAt)));
  if (active.length === 0) await setConsent(tx, userId, "family_share", false);
  await audit(tx, `user:${userId}`, "family_link_revoked", `family_links:${linkId}`, null, null);
}

/**
 * The ONLY data a family member can ever see. Built field by field from an allow-list, so there is
 * no path by which a transaction, merchant, amount spent or amount owed can reach the page.
 */
export type FamilyView = {
  firstName: string;
  paymentStatus: "on_track" | "needs_attention" | "not_shared";
  streak: number;
  ladder: { reached: number; total: number; cyclesToNext: number | null };
  scoreStage: "not_started" | "building" | "first_score";
  cyclesToFirstScore: number;
};

/** Runs as the system actor (the viewer is not signed in), so it must only ever return FamilyView. */
export async function familyView(tx: Tx, token: string): Promise<FamilyView | null> {
  const [link] = await tx.select().from(familyLinks).where(and(eq(familyLinks.token, token), isNull(familyLinks.revokedAt)));
  if (!link) return null;
  const [u] = await tx.select({ fullName: users.fullName, deletedAt: users.deletedAt }).from(users).where(eq(users.id, link.userId));
  if (!u || u.deletedAt) return null;
  const c = await getConfig(tx);
  const [line] = await tx.select().from(creditLines).where(eq(creditLines.userId, link.userId));
  const cys = line
    ? await tx
        .select({ status: cycles.status, onTime: cycles.onTime, slipStep: cycles.slipStep, n: cycles.n, statementAmount: cycles.statementAmount, dueDate: cycles.dueDate })
        .from(cycles)
        .where(eq(cycles.lineId, line.id))
    : [];
  const settled = historyOf(cys, await todayFor(tx, link.userId));
  const late = cys.some((x) => x.status === "billed" && x.slipStep >= 3);
  const streak = cleanStreak(settled);
  const rungs = line ? ladderPreview(line.baseLimit, c) : [];
  const reached = rungs.filter((r) => streak >= r.cycles).length;
  const next = rungs.find((r) => streak < r.cycles);
  const journey = scoreJourney(settled, c);
  await tx.update(familyLinks).set({ lastViewedAt: new Date() }).where(eq(familyLinks.id, link.id));
  return {
    firstName: (u.fullName ?? "").split(/\s+/)[0],
    paymentStatus: !late ? "on_track" : link.showAttentionFlag ? "needs_attention" : "not_shared",
    streak,
    ladder: { reached, total: rungs.length, cyclesToNext: next ? next.cycles - streak : null },
    scoreStage: journey.stage,
    cyclesToFirstScore: journey.cyclesToFirstScore,
  };
}
