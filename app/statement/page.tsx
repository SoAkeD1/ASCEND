import Link from "next/link";
import { AppPage } from "@/components/AppPage";
import { AllCharges, StreakChip } from "@/components/bits";
import { CoolingOffExit, RepayButton } from "@/components/actions";
import { loadApp, asUser } from "@/lib/page";
import { lineTransactions } from "@/lib/services/line";
import { unpaidOf } from "@/lib/services/common";
import { inr, longDate, ordinal, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StatementPage() {
  const { st, userId } = await loadApp();
  const { data: txns } = await asUser((tx) => lineTransactions(tx, userId));
  const { c, line } = st;
  const fees = { interestPct: c.interest_on_time_pct, processing: c.processing_fee, annual: c.annual_fee, late: c.late_fee, foreclosure: c.foreclosure_fee };
  const billed = st.cycles.filter((x) => x.status === "billed" && unpaidOf(x) > 0);
  const billedTotal = billed.reduce((s, x) => s + unpaidOf(x), 0);
  const openSpend = st.open ? unpaidOf(st.open) : 0;
  const past = st.cycles.filter((x) => x.status === "settled").reverse();
  const thisCycle = st.open ? txns.filter((t) => t.cycleId === st.open!.id).reverse() : [];
  const lastSettled = past[0];

  return (
    <AppPage st={st} title="Statement" trust>
      {lastSettled && lastSettled.onTime && (lastSettled.statementAmount ?? 0) > 0 && (
        <section className="flex items-center gap-3 rounded-[16px] border border-mint-line bg-mint p-4">
          <StreakChip onTime={st.onTimeCount} cycles={st.settledCount} />
          <p className="text-[13px] text-teal">
            Cycle {lastSettled.n}: paid {inr(lastSettled.statementAmount!)} on {shortDate(lastSettled.paidAt!)}. On time.
          </p>
        </section>
      )}

      {st.plan ? (
        <section className="card p-4">
          <p className="eyebrow">Repayment plan</p>
          <p className="mt-1 text-[15px]">
            {inr(st.planLeft)} left on your plan. <Link href="/slip" className="font-semibold text-teal underline">See instalments</Link>
          </p>
        </section>
      ) : billedTotal > 0 ? (
        <section className="card p-4">
          <p className="text-[13px] text-muted">Current bill · due {longDate(billed[0].dueDate)}</p>
          <p className="mt-1 text-[34px] font-[780] tracking-[-0.035em] num">{inr(billedTotal)}</p>
          <p className="mb-3 text-[13px] text-muted">
            {(st.slip?.step ?? 0) >= 3 ? `Overdue · ${inr(c.late_fee)} fee` : line.autopayOn ? `AutoPay will pay it on ${shortDate(billed[0].dueDate)}` : "AutoPay is off: pay it yourself by the due date"}
          </p>
          <RepayButton amount={billedTotal + openSpend} label={openSpend > 0 ? `Pay ${inr(billedTotal + openSpend)} now (bill + this cycle)` : undefined} />
          <p className="mt-2 text-center text-[12px] text-muted">
            {inr(c.late_fee)} fee · {c.interest_on_time_pct}% interest · paying early is always free
          </p>
        </section>
      ) : openSpend > 0 ? (
        <section className="card p-4">
          <p className="text-[13px] text-muted">
            This cycle so far · bill on {longDate(st.open!.endDate)}, due {longDate(st.open!.dueDate)}
          </p>
          <p className="mt-1 text-[34px] font-[780] tracking-[-0.035em] num">{inr(openSpend)}</p>
          <p className="mb-3 text-[13px] text-muted">Pay early to keep your usage low. It still counts as on time.</p>
          <RepayButton amount={openSpend} />
        </section>
      ) : (
        <section className="card p-4">
          <p className="text-[16px] font-[650]">Nothing due right now</p>
          <p className="text-[13px] text-muted">Your next bill builds as you spend. It&apos;s due on the {ordinal(line.dueDay!)} after the cycle closes.</p>
        </section>
      )}

      {line.status === "cooling_off" && line.coolingOffUntil && <CoolingOffExit owed={st.outstanding} until={longDate(line.coolingOffUntil)} />}

      <section className="card p-4">
        <h3 className="text-[15px] font-[650]">This cycle{st.open ? ` (${shortDate(st.open.startDate)} – ${shortDate(st.open.endDate)})` : ""}</h3>
        {thisCycle.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">No spends yet this cycle.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {thisCycle.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{t.merchant}</span>
                  <span className="text-[12px] text-muted">
                    {shortDate(t.spentOn)} · {t.category} · UPI
                  </span>
                </span>
                <span className="text-[14px] font-[650] num">{inr(t.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="card p-4">
          <h3 className="text-[15px] font-[650]">Past bills</h3>
          <ul className="mt-2 divide-y divide-line">
            {past.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                <span>
                  <span className="block text-[14px] font-semibold">Cycle {x.n}</span>
                  <span className="text-[12px] text-muted">Due {shortDate(x.dueDate)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-[14px] font-[650] num">{inr(x.statementAmount ?? 0)}</span>
                  <span className={`text-[12px] font-semibold ${x.onTime ? "text-teal" : "text-amber"}`}>{x.onTime ? "On time" : "Late"}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <AllCharges fees={fees} />
    </AppPage>
  );
}
