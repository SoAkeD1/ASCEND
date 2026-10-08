import { z } from "zod";
import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/respond";
import { normaliseIdentifier, requestOtp } from "@/lib/auth/otp";
import { otpChannel } from "@/lib/providers/otp";
import { clientIp } from "@/lib/api/request";

export const dynamic = "force-dynamic";

const email = z.object({ identifier: z.string().trim().email().max(200) });
const phone = z.object({ identifier: z.string().trim().regex(/^\+?\d[\d\s-]{8,15}$/, "must be a phone number") });

export async function POST(req: NextRequest) {
  try {
    const body = (otpChannel() === "email" ? email : phone).parse(await req.json());
    const r = await requestOtp(normaliseIdentifier(body.identifier), clientIp(req));
    if (!r.ok) return ok({ error: r.error }, { status: 429 });
    return ok({ sent: true, sandboxCode: r.sandboxCode ?? null });
  } catch (e) {
    return fail(e);
  }
}
