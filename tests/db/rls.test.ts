import { beforeAll, describe, expect, it } from "vitest";
import { withActor, SYSTEM } from "@/lib/db/actor";
import { consents, users, config, otpCodes } from "@/lib/db/schema";
import { getConfig } from "@/lib/config";
import { freshDb } from "../helpers/db";

let a: string, b: string;

beforeAll(async () => {
  await freshDb();
  await withActor(SYSTEM, async (tx) => {
    const rows = await tx.insert(users).values([{ cohort: "2026-10" }, { cohort: "2026-10" }]).returning({ id: users.id });
    [a, b] = rows.map((r) => r.id);
    await tx.insert(consents).values([
      { userId: a, type: "aa", granted: true, purpose: "test" },
      { userId: b, type: "aa", granted: true, purpose: "test" },
    ]);
  });
}, 60_000);

describe("row level security", () => {
  it("a user sees only their own rows", async () => {
    const seen = await withActor({ kind: "user", userId: a }, (tx) => tx.select().from(consents));
    expect(seen.map((r) => r.userId)).toEqual([a]);
    const people = await withActor({ kind: "user", userId: a }, (tx) => tx.select().from(users));
    expect(people.map((r) => r.id)).toEqual([a]);
  });

  it("a user cannot write a row for someone else", async () => {
    await expect(
      withActor({ kind: "user", userId: a }, (tx) => tx.insert(consents).values({ userId: b, type: "kyc", granted: true, purpose: "x" })),
    ).rejects.toThrow();
  });

  it("staff and the system see everything", async () => {
    const seen = await withActor({ kind: "staff", userId: a, role: "lender" }, (tx) => tx.select().from(consents));
    expect(seen).toHaveLength(2);
  });

  it("users can read config but not change it", async () => {
    const c = await withActor({ kind: "user", userId: a }, (tx) => getConfig(tx));
    expect(c.limit_pct).toBeTypeOf("number");
    const changed = await withActor({ kind: "user", userId: a }, (tx) => tx.update(config).set({ version: 99 }).returning());
    expect(changed).toHaveLength(0);
  });

  it("users cannot read sign-in codes", async () => {
    expect(await withActor({ kind: "user", userId: a }, (tx) => tx.select().from(otpCodes))).toEqual([]);
  });
});
