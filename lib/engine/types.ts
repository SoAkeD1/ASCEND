import type { Config } from "../config/schema";

/** Each engine takes only the config keys it needs, so tests and callers see its exact inputs. */
export type LimitRules = Pick<Config, "limit_pct" | "limit_min" | "limit_max" | "limit_rounding">;
export type InflowRules = Pick<Config, "bounce_keywords">;

export type InflowTxn = {
  date: string;
  amount: number;
  description: string;
  kind: "credit" | "debit" | "bounce";
  source: "csv" | "manual";
};

export type BureauStatus = "none" | "thin" | "clean" | "active_default";

export type LineStatus = "pending" | "cooling_off" | "active" | "paused" | "frozen" | "recovery" | "closed" | "graduated";
