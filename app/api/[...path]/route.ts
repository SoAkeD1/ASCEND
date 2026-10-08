import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { matchRoute, ROUTES } from "@/lib/api/registry";
import { fail, ok } from "@/lib/api/respond";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { actorOf } from "@/lib/auth/current";
import { withActor, SYSTEM } from "@/lib/db/actor";
import { catchUp } from "@/lib/services/view";

export const dynamic = "force-dynamic";

/**
 * One entry point for every action in lib/api/registry.ts:
 * find the action → check who is calling → validate the input with Zod → run it as that actor.
 */
async function dispatch(req: NextRequest, { params }: { params: { path: string[] } }) {
  try {
    const m = matchRoute(req.method, params.path);
    if (!m) return ok({ error: "Not found." }, { status: 404 });
    const route = ROUTES[m.key];
    const session = await verifySession(cookies().get(SESSION_COOKIE)?.value);
    const isPublic = route.who.includes("public");
    if (!isPublic) {
      if (!session) return ok({ error: "Please sign in." }, { status: 401 });
      if (!route.who.includes(session.role)) return ok({ error: "You do not have access to this." }, { status: 403 });
    }
    const raw = req.method === "GET" || req.method === "DELETE" ? {} : await req.json().catch(() => ({}));
    const input = route.input.parse(raw);
    if (route.catchUp && session) await catchUp(session.userId);
    const actor = isPublic || !session ? SYSTEM : actorOf(session);
    const result = await withActor(actor, (tx) => route.run(tx, session, input, m.params));
    return ok(result ?? { ok: true });
  } catch (e) {
    return fail(e);
  }
}

export { dispatch as GET, dispatch as POST, dispatch as PUT, dispatch as PATCH, dispatch as DELETE };
