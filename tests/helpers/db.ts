import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { setDbForTests, type Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { clearConfigCache } from "@/lib/config";
import { migrateDb, seedConfig } from "../../db/migrate";

/** A brand-new in-memory Postgres with the real migrations and config seed applied. */
export async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Db;
  setDbForTests(db);
  await migrateDb(db, "pglite");
  await seedConfig(db);
  clearConfigCache();
  return db;
}
