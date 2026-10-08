import { z } from "zod";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { fail, ok } from "@/lib/api/respond";
import { normaliseIdentifier, verifyOtp } from "@/lib/auth/otp";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/auth/session";
import { withActor } from "@/lib/db/actor";
import { nextStep } from "@/lib/services/onboarding";
import { clientIp } from "@/lib/api/request";

export const dynamic = "force-dynamic";

const input = z.object({ identifier: z.string().trim().min(3).max(200), code: z.string().trim().regex(/^\d{6}$/, "must be 6 digits") });

export async function POST(req: NextRequest) {
  try {
    const body = input.parse(await req.json());
    const r = await verifyOtp(normaliseIdentifier(body.identifier), body.code, clientIp(req));
    if (!r.ok) return ok({ error: r.error }, { status: 400 });
    cookies().set(SESSION_COOKIE, await signSession({ userId: r.userId, role: r.role }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    });
    if (r.role === "admin") return ok({ next: "/admin" });
    if (r.role === "lender") return ok({ next: "/lender" });
    const step = await withActor({ kind: "user", userId: r.userId }, (tx) => nextStep(tx, r.userId));
    return ok({ next: step === "home" ? "/home" : `/start/${step}` });
  } catch (e) {
    return fail(e);
  }
}
