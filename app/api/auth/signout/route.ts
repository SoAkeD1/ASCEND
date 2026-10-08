import { cookies } from "next/headers";
import { ok } from "@/lib/api/respond";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { RETURN_COOKIE } from "@/lib/api/request";

export async function POST() {
  const back = cookies().get(RETURN_COOKIE)?.value;
  if (back) {
    // Leaving a demo user's view: restore the admin's own session.
    cookies().set(SESSION_COOKIE, back, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
    cookies().delete(RETURN_COOKIE);
    return ok({ next: "/admin" });
  }
  cookies().delete(SESSION_COOKIE);
  return ok({ next: "/" });
}
