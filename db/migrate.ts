import path from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "../lib/db";
import { config } from "../lib/db/schema";
import { configSchema } from "../lib/config/schema";
import { DEFAULT_CONFIG } from "./seed-config";

const migrationsFolder = path.join(process.cwd(), "db", "migrations");

/** Create or upgrade the tables (and the security policies in 0001_rls.sql). */
export async function migrateDb(db: Db, driver: "pglite" | "postgres") {
  if (driver === "postgres") {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(db, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder });
  }
}

/** Insert any config rows that do not exist yet. Never overwrites a value an admin has edited. */
export async function seedConfig(db: Db): Promise<number> {
  const values = configSchema.parse(DEFAULT_CONFIG);
  let inserted = 0;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.role', 'system', true)`);
    for (const [key, value] of Object.entries(values)) {
      const res = await tx.insert(config).values({ key, value, updatedBy: "seed" }).onConflictDoNothing().returning({ key: config.key });
      inserted += res.length;
    }
  });
  return inserted;
}
