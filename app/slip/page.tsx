import { AppPage } from "@/components/AppPage";
import { HardshipChooser, PayInstalmentButton, RepayButton } from "@/components/actions";
import { loadApp, asUser } from "@/lib/page";
import { hardshipQuote, type Instalment } from "@/lib/services/line";
import { unpaidOf } from "@/lib/services/common";
import { STEP_NAMES } from "@/lib/engine/slipLadder";
import { addDays } from "@/lib/engine/dates";
import { inr, longDate, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SlipPage() {
  const { st, userId } = await loadApp();
  const { data: quote } = await asUser((tx) => hardshipQuote(tx, userId));
  const { c, line } = st;
  const step = st.slip?.step ?? 0;
  const bill = st.bill;
  const owed = bill ? unpaidOf(bill) : 0;
  const d = st.slipDates;

  const steps = [
    { n: 1, when: d ? `${shortDate(d[1])} · ${c.reminder_before_days} days before` : `${c.reminder_before_days} days before the due date`, body: "A reminder to you, with the exact amount and date." },
    { n: 2, when: d ? `${shortDate(d[2])} · due date` : "Due date", body: "AutoPay tries to pay. If it can't, you'll see a one-tap pay button." },
    { n: 3, when: d ? `${shortDate(d[3])} – ${shortDate(addDays(d[4], -1))}` : `Days 1–${c.grace_days} late`, body: `Grace. Spends pause, the fee is ${inr(c.late_fee)}, and paying clears everything.` },
    { n: 4, when: d ? `From ${shortDate(d[4])}` : `Days ${c.grace_days + 1}–${c.freeze_dpd - 1} late`, body: `Weekly reminders to you only. On day ${c.bureau_report_dpd} late (${d ? shortDate(d.reported) : "—"}) it's reported to the bureaus.` },
    { n: 5, when: d ? `From ${shortDate(d[5])}` : `From day ${c.freeze_dpd} late`, body: `The line freezes and you can split what you owe into a ${c.hardship_months_options.join(" or ")}-month plan.` },
    { n: 6, when: d ? `From ${shortDate(d[6])}` : `From day ${c.recovery_dpd} late`, body: `${c.partner_bank_name}'s regulated recovery process. We never contact family or friends.` },
  ];

  const headline = st.plan
    ? "Your plan is running"
    : step === 0
      ? "All clear"
      : step <= 2
        ? "Your bill is coming up"
        : step === 3
          ? "Payment missed: you're in grace"
          : step === 4
            ? "Your bill is overdue"
            : step === 5
              ? "Your line is frozen"
              : "Recovery has started";
  const sub = st.plan
    ? `${inr(st.planLeft)} left. Pay each instalment and your line comes back.`
    : step === 0
      ? "Nothing is overdue. This is what would happen if a payment were ever missed, so there are no surprises."
      : `${inr(owed)} was due on ${longDate(bill!.dueDate)}${st.slip!.dpd > 0 ? ` (${st.slip!.dpd} days ago)` : ""}. Fee: ${inr(c.late_fee)}.`;

  const schedule = st.plan ? (st.plan.scheduleJson as Instalment[]) : [];
  const nextInst = st.plan ? schedule[st.plan.paidInstalments] : null;
  const comeback = line.comebackRestoreLimit !== null;

  return (
    <AppPage st={st} title="If a payment slips" back="/home">
      <section className={`rounded-[18px] p-4 ${step >= 3 || st.plan ? "bg-amber-soft" : "bg-mint"}`}>
        <h2 className={`text-[22px] font-[780] tracking-[-0.02em] ${step >= 3 || st.plan ? "text-amber-deep" : "text-teal"}`}>{headline}</h2>
        <p className="mt-1 text-[14px] leading-relaxed">{sub}</p>
        <p className="mt-2 text-[13px] font-semibold">We will never contact your family or friends.</p>
      </section>

      {!st.plan && owed > 0 && step >= 2 && <RepayButton amount={owed + (st.open ? unpaidOf(st.open) : 0)} label={`Pay ${inr(owed)} now · ${inr(c.late_fee)} fee`} />}

      {st.plan && nextInst && (
        <section className="card p-4">
          <h3 className="text-[16px] font-[700]">
            Your {st.plan.months}-month plan · {inr(st.plan.principal)} owed
          </h3>
          <ul className="mt-2 divide-y divide-line text-[14px]">
            {schedule.map((i, idx) => (
              <li key={i.n} className="flex justify-between py-1.5">
                <span className={idx < st.plan!.paidInstalments ? "text-muted line-through" : ""}>
                  Month {i.n} · due {shortDate(i.due)}
                </span>
                <span className="font-[650] num">{inr(i.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="my-2 text-[12px] text-muted">
            Interest {inr(st.plan.totalInterest)} at {st.plan.apr}% APR goes to the lender. Ascend earns {inr(st.plan.ascendRevenue)}.
          </p>
          <PayInstalmentButton amount={nextInst.amount} n={nextInst.n} />
        </section>
      )}

      {!st.plan && quote.eligible && quote.plans.length > 0 && <HardshipChooser plans={quote.plans} />}

      {comeback && (
        <section className="card p-4">
          <h3 className="text-[16px] font-[700]">Your comeback path</h3>
          <p className="mt-1 text-[13px] text-muted">
            {c.comeback_cycles} on-time cycles in a row restore your {inr(line.comebackRestoreLimit!)} limit. One slip doesn&apos;t define your record.
          </p>
          <div className="mt-3 flex gap-1.5">
            {Array.from({ length: c.comeback_cycles }, (_, i) => (
              <span key={i} className={`h-2.5 flex-1 rounded-full ${i < st.streak ? "bg-teal" : "bg-mint"}`} />
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {Math.min(st.streak, c.comeback_cycles)} of {c.comeback_cycles} done
          </p>
        </section>
      )}

      <section className="card p-4">
        <h3 className="text-[15px] font-[650]">What happens, step by step</h3>
        <ol className="mt-3 flex flex-col gap-3">
          {steps.map((s) => {
            const here = s.n === step && !st.plan;
            const past = s.n < step && !st.plan;
            return (
              <li key={s.n} className={`flex gap-3 rounded-[12px] p-2.5 ${here ? "bg-amber-soft ring-1 ring-amber-line" : ""}`}>
                <span
                  className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-[13px] font-bold ${here ? "bg-amber text-white" : past ? "bg-teal text-white" : "border-2 border-line text-muted"}`}
                >
                  {s.n}
                </span>
                <div>
                  <div className="text-[14px] font-[650]">
                    {STEP_NAMES[s.n as 1]} <span className="font-normal text-muted">· {s.when}</span>
                  </div>
                  <p className="text-[13px] leading-snug text-muted">{s.body}</p>
                  {here && <p className="mt-1 text-[12px] font-bold uppercase tracking-[0.06em] text-amber">You are here</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </AppPage>
  );
}
