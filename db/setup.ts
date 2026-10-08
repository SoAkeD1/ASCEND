/**
 * `npm run db:setup`: create/upgrade the tables, then insert any missing config rows.
 * Safe to run repeatedly. Stop the dev server first when using the local PGlite database,
 * because only one process can open its files at a time.
 */
import { getDb } from "../lib/db";
import { DEFAULT_CONFIG } from "./seed-config";
import { migrateDb, seedConfig } from "./migrate";

(async () => {
  const db = getDb();
  await migrateDb(db, process.env.DATABASE_URL ? "postgres" : "pglite");
  const n = await seedConfig(db);
  console.log(`Database ready. ${n} config rows inserted, ${Object.keys(DEFAULT_CONFIG).length - n} already existed.`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
