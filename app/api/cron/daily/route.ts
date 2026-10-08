import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/respond";
import { runDailyAll } from "@/lib/services/daily";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called once a day by Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return ok({ error: "Unauthorised." }, { status: 401 });
  try {
    return ok(await runDailyAll());
  } catch (e) {
    return fail(e);
  }
}
