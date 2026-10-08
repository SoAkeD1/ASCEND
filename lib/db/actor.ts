import { sql } from "drizzle-orm";
import { getDb, type Tx } from "./index";

/**
 * Who a piece of work is done for. Every database access goes through withActor, which runs it in
 * a transaction as the restricted `ascend_app` role with app.user_id / app.role set. The Row Level
 * Security policies in db/migrations/0001_rls.sql then decide which rows are visible.
 */
export type Actor =
  | { kind: "user"; userId: string }
  | { kind: "staff"; userId: string; role: "lender" | "admin" }
  | { kind: "system" };

export const SYSTEM: Actor = { kind: "system" };

export function actorLabel(a: Actor): string {
  return a.kind === "system" ? "system" : `${a.kind === "staff" ? a.role : "user"}:${a.userId}`;
}

export async function withActor<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const userId = actor.kind === "system" ? "" : actor.userId;
  const role = actor.kind === "system" ? "system" : actor.kind === "staff" ? actor.role : "user";
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true), set_config('app.role', ${role}, true)`);
    await tx.execute(sql`set local role ascend_app`);
    return fn(tx);
  });
}
