import { redirect } from "next/navigation";
import { requireSession, actorOf } from "./auth/current";
import { withActor } from "./db/actor";
import type { Tx } from "./db";
import { appState, catchUp, type LineState } from "./services/view";
import { nextStep, type Step } from "./services/onboarding";

export const stepPath = (s: Step) => (s === "home" ? "/home" : `/start/${s.replace("_", "-")}`);

/** For the signed-in app screens: bring the line up to today, load state, or send to onboarding. */
export async function loadApp(): Promise<{ userId: string; role: string; st: LineState }> {
  const s = await requireSession();
  await catchUp(s.userId);
  const st = await withActor(actorOf(s), (tx) => appState(tx, s.userId));
  if (!st.line) redirect(stepPath(await withActor(actorOf(s), (tx) => nextStep(tx, s.userId))));
  return { userId: s.userId, role: s.role, st: st as LineState };
}

/** For onboarding screens: run `fn` as the user. If they belong on a different step, move them. */
export async function loadStep<T>(allowed: Step[], fn: (tx: Tx, userId: string) => Promise<T>) {
  const s = await requireSession();
  return withActor(actorOf(s), async (tx) => {
    const step = await nextStep(tx, s.userId);
    if (!allowed.includes(step)) redirect(stepPath(step));
    return { userId: s.userId, step, data: await fn(tx, s.userId) };
  });
}

/** Run something as the signed-in user (any page). */
export async function asUser<T>(fn: (tx: Tx, userId: string) => Promise<T>) {
  const s = await requireSession();
  return { session: s, data: await withActor(actorOf(s), (tx) => fn(tx, s.userId)) };
}
