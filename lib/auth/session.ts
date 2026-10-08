import { SignJWT, jwtVerify } from "jose";

/**
 * A signed session token in an httpOnly cookie. It holds only the user id and role; the signature
 * (HMAC with SESSION_SECRET) means it cannot be edited in the browser without being rejected.
 * Kept free of Node-only APIs so middleware (edge runtime) can verify it too.
 */
export const SESSION_COOKIE = "ascend_session";
export const SESSION_DAYS = 30;

export type Session = { userId: string; role: "user" | "lender" | "admin" };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ role: s.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const role = payload.role;
    if (!payload.sub || (role !== "user" && role !== "lender" && role !== "admin")) return null;
    return { userId: payload.sub, role };
  } catch {
    return null;
  }
}
