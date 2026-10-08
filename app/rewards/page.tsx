import { AppPage } from "@/components/AppPage";
import { LadderBar } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { Confetti } from "@/components/client";
import { loadApp, asUser } from "@/lib/page";
import { userRewards } from "@/lib/services/line";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const { st, userId } = await loadApp();
  const { data: rewards } = await asUser((tx) => userRewards(tx, userId));
  const { c, line } = st;
  const graduated = line.status === "graduated";
  const tierCash = c.cashback_by_tier[Math.min(line.tier, c.cashback_by_tier.length) - 1];

  return (
    <AppPage st={st} title="Rewards">
      {graduated && (
        <section className="relative overflow-hidden rounded-hero bg-teal p-5 text-white shadow-hero">
          <Confetti />
          <Icon name="cap" size={34} />
          <h2 className="mt-2 text-[26px] font-[780] tracking-[-0.03em]">You&apos;ve graduated.</h2>
          <p className="mt-1 text-[14px] text-white/80">
            {st.streak} on-time cycles in a row. {c.partner_bank_name} has a credit card offer for you, and your on-time record comes with you.
          </p>
          <p className="mt-3 rounded-[12px] bg-white/10 px-3 py-2 text-[12px] text-white/80">The card itself is issued by {c.partner_bank_name} under its own terms. This demo stops here.</p>
        </section>
      )}

      <section className="card p-4">
        <p className="text-[13px] text-muted">Cashback earned</p>
        <p className="text-[34px] font-[780] tracking-[-0.035em] num">{inr(st.cashback)}</p>
        <p className="text-[13px] text-muted">
          Tier {line.tier}: {inr(tierCash)} for each cycle paid in full on time (with at least {inr(c.cashback_min_cycle_spend)} spent). We reward paying on time, never spending more.
        </p>
      </section>

      <section className="card p-4">
        <h3 className="text-[15px] font-[650]">Your ladder</h3>
        <LadderBar streak={st.streak} rungs={st.rungs} baseLimit={line.baseLimit} />
        <ol className="mt-2 divide-y divide-line text-[14px]">
          <li className="flex justify-between py-2">
            <span>Start</span>
            <span className="font-[650] num">{inr(line.baseLimit)}</span>
          </li>
          {st.rungs.map((r) => (
            <li key={r.cycles} className={`flex justify-between py-2 ${st.streak >= r.cycles ? "text-teal" : ""}`}>
              <span>
                {r.cycles} on-time cycles {st.streak >= r.cycles ? "✓" : ""}
              </span>
              <span className="font-[650] num">{r.graduate ? "Card offer" : inr(r.limit!)}</span>
            </li>
          ))}
        </ol>
        {st.ladderBlockedBy && <p className="mt-2 text-[12px] text-amber">Increases are paused right now ({st.ladderBlockedBy.replace("_", " ")}).</p>}
      </section>

      <section className="card p-4">
        <h3 className="text-[15px] font-[650]">History</h3>
        {rewards.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted">Your first cashback arrives when your first bill is paid on time.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {[...rewards].reverse().map((r) => (
              <li key={r.id} className="flex justify-between py-2 text-[14px]">
                <span>{r.reason}</span>
                <span className="font-[650] text-teal num">+{inr(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppPage>
  );
}
