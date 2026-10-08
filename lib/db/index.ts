import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const g = globalThis as unknown as { __ascendDb?: Db };

/**
 * Production: DATABASE_URL points at Supabase Postgres.
 * Local development: no DATABASE_URL, so we run PGlite, a full Postgres compiled to WebAssembly,
 * storing its files in PGLITE_DIR. Both speak the same SQL, so the rest of the app cannot tell.
 */
export function getDb(): Db {
  if (g.__ascendDb) return g.__ascendDb;
  const url = process.env.DATABASE_URL;
  if (url) {
    // prepare:false is required by Supabase's transaction-mode connection pooler.
    g.__ascendDb = drizzlePg(postgres(url, { prepare: false, max: 5 }), { schema });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PGlite } = require("@electric-sql/pglite");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/pglite");
    const client = new PGlite(process.env.PGLITE_DIR ?? ".pglite");
    g.__ascendDb = drizzle(client, { schema }) as Db;
  }
  return g.__ascendDb!;
}

/** Tests use an in-memory database. */
export function setDbForTests(db: Db) {
  g.__ascendDb = db;
}

export { schema };
