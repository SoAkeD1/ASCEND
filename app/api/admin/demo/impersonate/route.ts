import { z } from "zod";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { fail, ok } from "@/lib/api/respond";
import { SESSION_COOKIE, signSession, verifySession } from "@/lib/auth/session";
import { withActor, SYSTEM } from "@/lib/db/actor";
import { users } from "@/lib/db/schema";
import { demoMode } from "@/lib/clock";
import { RETURN_COOKIE } from "@/lib/api/request";

export const dynamic = "force-dynamic";

/** Demo mode only: an admin opens the app AS a user created with "Create test user". */
export async function POST(req: NextRequest) {
  try {
    if (!demoMode()) return ok({ error: "Demo tools are switched off." }, { status: 403 });
    const adminToken = cookies().get(SESSION_COOKIE)?.value;
    const s = await verifySession(adminToken);
    if (s?.role !== "admin") return ok({ error: "Admins only." }, { status: 403 });
    const { userId } = z.object({ userId: z.string().uuid() }).parse(await req.json());
    const [u] = await withActor(SYSTEM, (tx) => tx.select().from(users).where(eq(users.id, userId)));
    if (!u?.isDemo) return ok({ error: "Only demo users can be opened this way." }, { status: 403 });
    const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" };
    cookies().set(RETURN_COOKIE, adminToken!, opts);
    cookies().set(SESSION_COOKIE, await signSession({ userId, role: "user" }), opts);
    return ok({ next: "/home" });
  } catch (e) {
    return fail(e);
  }
}
