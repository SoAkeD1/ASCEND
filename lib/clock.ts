import { eq } from "drizzle-orm";
import { addDays, type IsoDate } from "./engine/dates";
import type { Tx } from "./db";
import { users } from "./db/schema";

/**
 * The only place the app asks "what day is it?". Production uses the real date in APP_TIMEZONE.
 * In demo mode an admin can move one user's clock forward (users.clock_offset_days) to show what
 * happens over months without waiting; every engine then sees that user's shifted date.
 */
export const demoMode = () => process.env.DEMO_MODE === "true";

export function realToday(): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE ?? "Asia/Kolkata" }).format(new Date());
}

export async function todayFor(tx: Tx, userId: string): Promise<IsoDate> {
  if (!demoMode()) return realToday();
  const [u] = await tx.select({ offset: users.clockOffsetDays }).from(users).where(eq(users.id, userId));
  return addDays(realToday(), u?.offset ?? 0);
}

export const clock = { now: todayFor, realToday };
