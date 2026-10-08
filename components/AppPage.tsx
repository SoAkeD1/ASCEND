import type { ReactNode } from "react";
import { AppBar, TrustStrip, type PillKind } from "./bits";
import { MobileFrame } from "./Frame";
import { TabBar } from "./client";
import { initials } from "@/lib/format";
import type { LineState } from "@/lib/services/view";

/** Signed-in screen: top bar, scrolling content, bottom tabs, and the trust strip on money screens. */
export function AppPage({ st, title, back, children, trust = false }: { st: LineState; title: string; back?: string; children: ReactNode; trust?: boolean }) {
  return (
    <MobileFrame>
      <AppBar title={title} back={back} initials={initials(st.user.fullName)} alert={st.unread > 0 || (st.slip?.step ?? 0) >= 2} />
      <main className="flex flex-1 animate-asc-in flex-col gap-3.5 p-4">
        {children}
        {trust && <TrustStrip partner={st.c.partner_bank_name} interestPct={st.c.interest_on_time_pct} lateFee={st.c.late_fee} />}
      </main>
      <TabBar />
    </MobileFrame>
  );
}

/** The single status shown on the line card, derived from the line and its oldest unpaid bill. */
export function lineStatusPill(st: LineState): { kind: PillKind; label?: string } {
  const step = st.slip?.step ?? 0;
  if (st.line.status === "graduated") return { kind: "graduated" };
  if (st.line.status === "frozen" || st.line.status === "recovery") return { kind: "frozen", label: st.line.status === "recovery" ? "Recovery" : "Frozen" };
  if (step >= 4) return { kind: "grace", label: "Overdue" };
  if (step === 3) return { kind: "grace" };
  if (step >= 1) return { kind: "due" };
  if (st.line.status === "cooling_off") return { kind: "notyet", label: "Cooling-off" };
  return { kind: "ontime" };
}

export function pausedReason(st: LineState): string | null {
  if (st.line.selfFrozen) return "You froze your line in Settings.";
  if (st.plan) return "Spends are paused while your repayment plan runs.";
  if (st.brake === "stop") return "New spends for your sign-up month are paused by our risk controls.";
  if (["paused", "frozen", "recovery"].includes(st.line.status)) return "A bill is overdue, so spends are paused until it's paid.";
  if (st.line.status === "graduated") return "You've graduated. Your next step is the card offer.";
  if (st.line.status === "closed") return "This line is closed.";
  return null;
}
