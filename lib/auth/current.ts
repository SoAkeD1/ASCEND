import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession, type Session } from "./session";
import type { Actor } from "../db/actor";

export async function currentSession(): Promise<Session | null> {
  return verifySession(cookies().get(SESSION_COOKIE)?.value);
}

/** For pages: signed-in users only, otherwise off to sign-up. */
export async function requireSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) redirect("/signup");
  return s;
}

export async function requireStaffSession(roles: ("lender" | "admin")[]): Promise<Session> {
  const s = await requireSession();
  if (s.role === "user" || !roles.includes(s.role)) redirect("/home");
  return s;
}

export function actorOf(s: Session): Actor {
  return s.role === "user" ? { kind: "user", userId: s.userId } : { kind: "staff", userId: s.userId, role: s.role };
}
