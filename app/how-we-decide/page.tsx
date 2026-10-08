import { MobileFrame } from "@/components/Frame";
import { AppBar } from "@/components/bits";
import { withActor, SYSTEM } from "@/lib/db/actor";
import { getConfig } from "@/lib/config";
import { currentSession, actorOf } from "@/lib/auth/current";
import { latestDecision } from "@/lib/services/common";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "How we decide · Ascend" };

const REASON_TEXT: Record<string, string> = {
  under_age: "under 18",
  active_default: "an active unpaid loan",
  low_inflow: "inflow below the minimum",
  short_history: "not enough months of history",
  recent_bounce: "a recent bounced payment",
};

export default async function HowWeDecidePage() {
  const c = await withActor(SYSTEM, (tx) => getConfig(tx));
  const s = await currentSession();
  const mine = s ? await withActor(actorOf(s), (tx) => latestDecision(tx, s.userId)) : null;
  const Box = ({ title, children, hl }: { title: string; children: React.ReactNode; hl?: boolean }) => (
    <section className={`card p-4 ${hl ? "ring-2 ring-teal" : ""}`}>
      <p className="eyebrow">{title}</p>
      <div className="mt-1 text-[14px] leading-relaxed">{children}</div>
    </section>
  );
  const Arrow = ({ label }: { label?: string }) => (
    <div className="flex items-center justify-center gap-2 text-[12px] text-muted" aria-hidden="true">
      <span className="h-5 w-px bg-line" />
      {label && <span>{label}</span>}
    </div>
  );
  return (
    <MobileFrame>
      <AppBar title="How we decide" mode="onboard" back={s ? "/home" : "/"} />
      <main className="flex flex-1 animate-asc-in flex-col gap-2 p-4">
        <p className="mb-2 text-[15px] leading-relaxed text-muted">
          We look at how money flows into your account, not who you know. We never use contacts, photos, social media or your college&apos;s ranking. Every threshold below is our live rule.
        </p>
        {mine && (
          <p className="mb-2 rounded-[12px] bg-mint px-3.5 py-3 text-[13px] text-teal">
            Your latest result: <strong>{mine.decision === "approved" ? `approved for ${inr(mine.offeredLimit ?? 0)}` : mine.decision === "builder" ? `Builder path (${REASON_TEXT[mine.reasonKey ?? ""]})` : "come back at 18"}</strong>.
          </p>
        )}
        <Box title="Start">
          KYC passed and age {c.min_age}+. Under {c.min_age} → a polite block with your own come-back date.
        </Box>
        <Arrow />
        <Box title="Gate 1 · Credit bureau" hl={mine?.reasonKey === "active_default"}>
          Is there an active default on record? No file, a thin file or a clean file all pass. An active unpaid loan → Builder path, re-check in {c.recheck_days} days.
        </Box>
        <Arrow label="passed" />
        <Box title="Gate 2 · Cash flow" hl={["low_inflow", "short_history", "recent_bounce"].includes(mine?.reasonKey ?? "")}>
          <ul className="list-disc pl-5">
            <li>Average inflow at least {inr(c.min_inflow)} a month</li>
            <li>At least {c.min_history_months} months of history</li>
            <li>No bounced payment in the last {c.bounce_lookback_days} days</li>
          </ul>
          Any check fails → Builder path with the exact reason, your number against ours, and a re-check in {c.recheck_days} days.
        </Box>
        <Arrow label="all pass" />
        <Box title="Your limit" hl={mine?.decision === "approved"}>
          {c.limit_pct}% of your average monthly inflow, rounded down to {inr(c.limit_rounding)}, kept between {inr(c.limit_min)} and {inr(c.limit_max)}. You can choose less, never more.
        </Box>
        <Arrow />
        <Box title="The ladder">
          {c.ladder.map((r) => ("mult" in r ? `${r.cycles} on-time cycles in a row → ${r.mult}× your starting limit` : `${r.cycles} → graduate to a credit card offer`)).join(" · ")}. Never above {inr(c.ladder_max)}. Paused if your inflow drops below {inr(c.min_inflow)}, a payment is late, or our risk brake is on.
        </Box>
        <section className="mt-3 rounded-[16px] bg-ink p-4 text-white">
          <h3 className="text-[15px] font-[700]">Every &quot;not yet&quot; comes with</h3>
          <p className="mt-1 text-[13px] text-[#C9D0D8]">The exact reason, what would change it, and an automatic re-check in {c.recheck_days} days. No dead ends.</p>
        </section>
      </main>
    </MobileFrame>
  );
}
