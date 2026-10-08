import type { NextRequest } from "next/server";

export const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

/** Holds the admin's own session while they view the app as a demo user. */
export const RETURN_COOKIE = "ascend_admin_return";
