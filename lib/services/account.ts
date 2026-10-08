import { and, desc, eq, isNull } from "drizzle-orm";
import type { Tx } from "../db";
import { consents, familyLinks, grievances, inflowTxns, kycRecords, notifications, statementUploads, transactions, users, moments } from "../db/schema";
import { getLine, lineCycles, outstandingOf, audit, UserError } from "./common";
import { activeHardshipPlan } from "./line";

export async function submitGrievance(tx: Tx, userId: string, subject: string, body: string) {
  const [g] = await tx.insert(grievances).values({ userId, subject, body }).returning();
  await audit(tx, `user:${userId}`, "grievance_submitted", `grievances:${g.id}`, null, { subject });
  return g;
}

export async function listGrievances(tx: Tx, userId: string) {
  return tx.select().from(grievances).where(eq(grievances.userId, userId)).orderBy(desc(grievances.createdAt));
}

export async function listNotifications(tx: Tx, userId: string) {
  return tx.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function pendingMoments(tx: Tx, userId: string) {
  return tx.select().from(moments).where(and(eq(moments.userId, userId), isNull(moments.shownAt))).orderBy(moments.createdAt);
}

export async function markMomentShown(tx: Tx, userId: string, id: string) {
  await tx.update(moments).set({ shownAt: new Date() }).where(and(eq(moments.id, id), eq(moments.userId, userId)));
}

/**
 * "Delete my data": wipes personal details and inflow data, revokes every consent and family link.
 * Loan rows (limits, cycles, repayments) stay, without a name attached, because the lender must
 * keep loan records. Not allowed while money is still owed, so a debt cannot vanish.
 */
export async function deleteMyData(tx: Tx, userId: string) {
  const line = await getLine(tx, userId);
  if (line) {
    const owed = outstandingOf(await lineCycles(tx, line.id));
    if (owed > 0 || (await activeHardshipPlan(tx, line.id))) throw new UserError("Please clear what you owe first. Then you can delete your data.", 409);
    await tx.update(transactions).set({ merchant: "redacted" }).where(eq(transactions.userId, userId));
  }
  await tx.delete(inflowTxns).where(eq(inflowTxns.userId, userId));
  await tx.delete(statementUploads).where(eq(statementUploads.userId, userId));
  await tx.delete(kycRecords).where(eq(kycRecords.userId, userId));
  await tx.update(consents).set({ granted: false, revokedAt: new Date() }).where(eq(consents.userId, userId));
  await tx.update(familyLinks).set({ revokedAt: new Date() }).where(and(eq(familyLinks.userId, userId), isNull(familyLinks.revokedAt)));
  await tx.delete(notifications).where(eq(notifications.userId, userId));
  await tx
    .update(users)
    .set({ fullName: null, email: null, phone: null, dob: null, college: null, course: null, year: null, deletedAt: new Date() })
    .where(eq(users.id, userId));
  await audit(tx, `user:${userId}`, "data_deleted", `users:${userId}`, null, { keptLoanRecords: Boolean(line) });
}
