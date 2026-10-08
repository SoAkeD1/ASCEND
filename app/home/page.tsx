import Link from "next/link";
import { AppPage, lineStatusPill, pausedReason } from "@/components/AppPage";
import { LadderBar, LimitMeter, StatusPill, StreakChip } from "@/components/bits";
import { Icon, Logo } from "@/components/Icon";
import { MomentCard } from "@/components/client";
import { loadApp, asUser } from "@/lib/page";
import { pendingMoments } from "@/lib/services/account";
import { momentCopy } from "@/lib/copy";
import { firstName, inr, longDate, ordinal, shortDate, weekdayDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { st, userId } = await loadApp();
  const { data: moments } = await asUser((tx) => pendingMoments(tx, userId));
  const { c, line } = st;
  const pill = lineStatusPill(st);
  const paused = pausedReason(st);
  const step = st.slip?.step ?? 0;
  const billDue = st.bill ? st.bill.dueDate : st.open?.dueDate;
  const owedNow = st.outstanding;
  const pctUsed = st.util.pct;

  return (
    <AppPage st={st} title="Home" trust>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-muted">{weekdayDate(st.today)}</div>
          <h2 className="mt-0.5 text-[28px] font-[780] tracking-[-0.035em]">Hi {firstName(st.user.fullName)}.</h2>
        </div>
        <StreakChip onTime={st.onTimeCount} cycles={st.settledCount} />
      </div>

      <section aria-label="Your Ascend line" className="relative flex-none overflow-hidden rounded-hero bg-teal px-5 pb-[18px] pt-5 text-white shadow-hero">
        <svg aria-hidden="true" width="240" height="190" viewBox="0 0 240 190" fill="none" stroke="#FFFFFF" className="absolute -right-6 -top-1.5 opacity-[0.13]" strokeWidth="2" strokeLinejoin="round">
          <path d="M0 190h48v-38h48v-38h48V76h48V38h48V0" />
        </svg>
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Logo size={22} light />
            <span className="text-[12px] font-[650] tracking-[0.02em] text-white/85">Ascend line · {c.partner_bank_name}</span>
          </div>
          <StatusPill {...pill} />
        </div>
        <div className="relative mt-[18px] text-[13px] text-white/70">Available to spend</div>
        <div className="relative text-[46px] font-[780] leading-[1.05] tracking-[-0.045em] num">{inr(paused ? 0 : st.available)}</div>
        <div className="relative mb-4 mt-1 text-[14px] text-white/70">
          of {inr(line.currentLimit)} · {inr(owedNow)} used
        </div>
        <div className="relative">
          <LimitMeter variant="dark" used={owedNow} limit={line.currentLimit} nudgePct={c.utilisation_nudge_pct} paused={!!paused} pausedWhy={paused ?? ""} />
        </div>
      </section>

      {line.status === "cooling_off" && line.coolingOffUntil && (
        <p className="rounded-[14px] border border-mint-line bg-mint px-3.5 py-3 text-[13px] text-teal">
          Cooling-off until {longDate(line.coolingOffUntil)}: you can still cancel at no cost from Statement.
        </p>
      )}

      {step >= 3 && (
        <Link href="/slip" className="flex w-full items-start gap-3 rounded-[16px] border border-amber-line bg-amber-soft p-3.5 text-left">
          <Icon name="clock" className="flex-none text-amber" />
          <span className="flex-1">
            <strong className="block text-[15px] text-amber">{step >= 5 ? "Your line is frozen" : step === 3 ? "Payment missed: you're in grace" : "Your bill is overdue"}</strong>
            <span className="text-[13px] leading-snug text-[#5B3A2A]">{paused} See what happens next.</span>
          </span>
        </Link>
      )}
      {st.plan && (
        <Link href="/slip" className="card flex items-center gap-3 p-3.5">
          <Icon name="doc" className="text-teal" />
          <span className="flex-1 text-[14px]">
            <strong>Repayment plan running.</strong> {inr(st.planLeft)} left.
          </span>
          <Icon name="chevron" className="text-muted" />
        </Link>
      )}
      {line.selfFrozen && step < 3 && (
        <Link href="/settings" className="card flex items-center gap-3 p-3.5">
          <Icon name="lock" className="text-teal" />
          <span className="flex-1 text-[14px]">
            <strong>You froze your line.</strong> Unfreeze anytime in Settings.
          </span>
        </Link>
      )}
      {line.status === "graduated" && (
        <Link href="/rewards" className="flex items-center gap-3 rounded-[16px] bg-teal p-4 text-white shadow-button">
          <Icon name="cap" size={26} />
          <span className="flex-1">
            <strong className="block text-[16px]">You&apos;ve graduated.</strong>
            <span className="text-[13px] text-[#D7ECE4]">{c.partner_bank_name} has a credit card offer for you.</span>
          </span>
        </Link>
      )}

      <section className="card flex items-center gap-3.5 p-4">
        <div className="flex h-14 w-[52px] flex-none flex-col items-center justify-center rounded-[12px] bg-mint text-teal">
          <span className="text-[10px] font-bold uppercase tracking-[0.06em]">Due</span>
          <span className="text-[20px] font-[750] leading-tight">{line.dueDay}</span>
        </div>
        {owedNow > 0 && billDue ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-[650]">
                {step >= 3 ? `${inr(st.bill ? st.bill.statementAmount! - st.bill.paidAmount : owedNow)} overdue` : st.bill ? `${inr(st.bill.statementAmount! - st.bill.paidAmount)} due ${shortDate(billDue)}` : `${inr(owedNow)} so far this cycle`}
              </div>
              <div className={`text-[13px] ${step >= 3 ? "text-amber" : "text-muted"}`}>
                {step >= 3
                  ? `Was due ${shortDate(billDue)} · ${inr(c.late_fee)} fee, pay anytime`
                  : st.bill
                    ? `In ${st.daysToDue} days · ${line.autopayOn ? "AutoPay on" : "AutoPay off, pay manually"}`
                    : `Bill on ${shortDate(st.open!.endDate)}, due ${shortDate(billDue)}`}
              </div>
            </div>
            <Link href="/statement" className="btn-secondary min-h-[44px] flex-none px-3.5 text-[14px]">
              Repay
            </Link>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-[650]">All clear. Nothing due.</div>
            <div className="text-[13px] text-muted">Spend with Pay and it shows up here.</div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/score" className="card flex flex-col gap-1 p-3.5">
          <span className="text-[12px] text-muted">Credit score</span>
          <span className="text-[20px] font-[750] tracking-[-0.02em] text-teal">{st.journey.stage === "first_score" ? "Ready" : "Building"}</span>
          <span className="text-[12px] leading-snug text-muted">
            {st.journey.stage === "first_score" ? "Enough history for a first score" : `First score expected after cycle ${c.first_score_cycle} · ${st.journey.cyclesToFirstScore} to go`}
          </span>
        </Link>
        <Link href="/rewards" className="card flex flex-col gap-1 p-3.5">
          <span className="text-[12px] text-muted">Cashback earned</span>
          <span className="text-[20px] font-[750] tracking-[-0.02em]">{inr(st.cashback)}</span>
          <span className="text-[12px] leading-snug text-muted">
            {inr(c.cashback_by_tier[Math.min(line.tier, c.cashback_by_tier.length) - 1])} for every on-time cycle at your tier
          </span>
        </Link>
      </div>

      <Link href="/rewards" className="card px-3.5 pb-2.5 pt-3.5">
        <span className="flex items-center justify-between text-[14px] font-[650]">
          Your ladder<span className="text-[12px] font-semibold text-teal">See all</span>
        </span>
        <LadderBar streak={st.streak} rungs={st.rungs} baseLimit={line.baseLimit} />
        {st.ladderBlockedBy && (
          <p className="text-[12px] text-amber">
            {st.ladderBlockedBy === "brake"
              ? "Limit increases are paused for your sign-up month by our risk controls."
              : st.ladderBlockedBy === "low_inflow"
                ? "Your latest inflow is below our minimum. Refresh your statement to unlock increases."
                : "Increases resume once your line is active."}
          </p>
        )}
      </Link>

      {moments.length > 0 ? (
        moments.slice(0, 2).map((m) => {
          const copy = momentCopy(m.trigger, m.payload as Record<string, unknown>, c);
          return <MomentCard key={m.id} id={m.id} {...copy} />;
        })
      ) : (
        <MomentCard
          label="Today's moment"
          tone={pctUsed > c.utilisation_nudge_pct ? "amber" : "teal"}
          tip={pctUsed > c.utilisation_nudge_pct ? `You're above ${c.utilisation_nudge_pct}% of your limit.` : `Keep usage under ${c.utilisation_nudge_pct}% before the ${ordinal(line.dueDay!)}.`}
          why={
            pctUsed > c.utilisation_nudge_pct
              ? "Bureaus read high usage as stretched. Paying part of your bill early brings it down, and there's no fee to do it."
              : "Credit bureaus look at how much of your limit you use. Low usage reads as in control, and that lifts your first score."
          }
        />
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <Link href="/pay" className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-[16px] bg-teal text-[13px] font-[650] text-white shadow-button transition hover:-translate-y-px">
          <Icon name="scan" /> Pay
        </Link>
        <Link href="/statement" className="btn-secondary min-h-[72px] flex-col gap-1.5 rounded-[16px] text-[13px]">
          <Icon name="up" /> Repay
        </Link>
        <Link href="/family" className="btn-secondary min-h-[72px] flex-col gap-1.5 rounded-[16px] text-[13px]">
          <Icon name="family" /> Family View
        </Link>
      </div>
      <div className="flex justify-center gap-5">
        <Link href="/how-we-decide" className="btn-link">
          How we decide
        </Link>
        <Link href="/parents" className="btn-link">
          For parents
        </Link>
      </div>
    </AppPage>
  );
}
