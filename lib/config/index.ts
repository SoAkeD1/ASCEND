import { config as configTable } from "../db/schema";
import type { Tx } from "../db";
import { configSchema, type Config } from "./schema";

/**
 * Reads every rule from the config table and validates it. Cached briefly per server instance;
 * an Admin save clears the cache straight away, other instances pick it up within CACHE_MS.
 */
const CACHE_MS = 30_000;
let cache: { at: number; value: Config; versions: Record<string, number> } | null = null;

export class ConfigMissingError extends Error {}

export async function getConfig(tx: Tx): Promise<Config> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const rows = await tx.select().from(configTable);
  if (rows.length === 0) throw new ConfigMissingError("The config table is empty. Run `npm run db:setup`.");
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigMissingError(`Config is incomplete or invalid: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  cache = { at: Date.now(), value: parsed.data, versions: Object.fromEntries(rows.map((r) => [r.key, r.version])) };
  return parsed.data;
}

export const clearConfigCache = () => {
  cache = null;
};
