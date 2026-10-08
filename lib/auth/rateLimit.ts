import { sql } from "drizzle-orm";
import type { Tx } from "../db";
import { rateLimits } from "../db/schema";

/**
 * Fixed-window rate limit stored in Postgres, so it works across serverless instances.
 * Returns true if this attempt is allowed.
 */
export async function hit(tx: Tx, key: string, max: number, windowMinutes: number): Promise<boolean> {
  const ms = windowMinutes * 60_000;
  const windowStart = new Date(Math.floor(Date.now() / ms) * ms);
  const [row] = await tx
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  return row.count <= max;
}

export async function clearOld(tx: Tx) {
  await tx.delete(rateLimits).where(sql`${rateLimits.windowStart} < now() - interval '1 day'`);
}
