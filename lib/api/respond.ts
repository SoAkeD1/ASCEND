import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UserError } from "../services/common";
import { ConfigMissingError } from "../config";

export const ok = (data: unknown = { ok: true }, init?: ResponseInit) => NextResponse.json(data, init);

export function fail(e: unknown) {
  if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") }, { status: 400 });
  }
  if (e instanceof ConfigMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
}
