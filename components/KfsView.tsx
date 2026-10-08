import type { Kfs } from "@/lib/engine/kfs";
import { inr, inrPaise, longDate } from "@/lib/format";

/** Renders a Key Fact Statement snapshot. Every number comes from the stored KFS JSON. */
export function KfsView({ kfs }: { kfs: Kfs }) {
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-[650] num">{v}</dd>
    </div>
  );
  const H = ({ children }: { children: React.ReactNode }) => <h4 className="mt-4 text-[13px] font-bold uppercase tracking-[0.06em] text-teal">{children}</h4>;
  const calc = kfs.limit.calc;
  return (
    <article className="text-[13px] leading-relaxed">
      <header className="border-b border-line pb-3">
        <p className="eyebrow">Key Fact Statement · version {kfs.version}</p>
        <h3 className="mt-1 text-[18px] font-[750]">Ascend Starter Line</h3>
        <p className="text-muted">Generated {longDate(kfs.generatedOn)}</p>
      </header>

      <H>Who lends, who runs the app</H>
      <p>
        Lender: <strong>{kfs.lender.name}</strong>, regulated by the {kfs.lender.regulatedBy}.
      </p>
      <p className="text-muted">{kfs.ascendRole}</p>

      <H>Your limit</H>
      <dl className="divide-y divide-line">
        <Row k="Sanctioned limit" v={inr(kfs.limit.chosen)} />
        <Row k="Offered" v={inr(kfs.limit.offered)} />
        <Row k="Average monthly inflow" v={inr(calc.avgMonthlyInflow)} />
        <Row k={`× ${calc.limitPct}%`} v={inrPaise(calc.raw)} />
        <Row k={`Rounded down to ${inr(calc.rounding)}, kept within ${inr(calc.min)}–${inr(calc.max)}`} v={inr(kfs.limit.offered)} />
      </dl>

      <H>What it costs</H>
      <dl className="divide-y divide-line">
        <Row k="Interest if paid in full by the due date" v={`${kfs.interest.onTimePct}%`} />
        <Row k="APR if paid on time" v={`${kfs.interest.aprOnTimePct}%`} />
        <Row k="Processing fee" v={inr(kfs.fees.processing)} />
        <Row k="Annual fee" v={inr(kfs.fees.annual)} />
        <Row k="Late fee" v={inr(kfs.fees.late)} />
        <Row k="Foreclosure / early repayment fee" v={inr(kfs.fees.foreclosure)} />
      </dl>
      <div className="mt-3 rounded-[12px] border-2 border-teal bg-mint p-3">
        <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-teal">Total cost of credit</div>
        <p className="mt-1">
          Borrow the full {inr(kfs.totalCostOfCredit.borrowed)} and repay on time: interest {inr(kfs.totalCostOfCredit.interest)} + fees {inr(kfs.totalCostOfCredit.fees)} ={" "}
          <strong className="text-[16px]">{inr(kfs.totalCostOfCredit.total)}</strong>
        </p>
      </div>

      <H>Billing</H>
      <p>
        Each cycle is {kfs.cycle.lengthDays} days. Your bill is due {kfs.cycle.dueOffsetDays} days after your money usually lands. You pay the statement in full; there is no minimum-due trap.
      </p>

      <H>If a payment is missed</H>
      <ol className="mt-1 flex flex-col gap-1">
        {kfs.slip.map((s) => (
          <li key={s.step} className="flex gap-2">
            <span className="w-24 flex-none font-[650]">{s.dayFromDue < 0 ? `${-s.dayFromDue} days before` : s.dayFromDue === 0 ? "Due date" : `Day ${s.dayFromDue} late`}</span>
            <span>
              Step {s.step}: {s.name}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-1 text-muted">
        Late fee at every step: {inr(kfs.fees.late)}. Reported to credit bureaus only from day {kfs.bureau.reportDpd} late.
      </p>

      <H>Hardship plan</H>
      <p>
        If you can&apos;t pay, you can split what you owe over {kfs.hardship.monthsOptions.join(" or ")} months at {kfs.hardship.aprPct}% APR (the lender&apos;s rate). Ascend earns{" "}
        {kfs.hardship.ascendShare}% of that interest.
      </p>
      {kfs.hardship.examples.map((e) => (
        <p key={e.months} className="text-muted">
          Example on {inr(e.principal)} over {e.months} months: {e.schedule.map((i) => inr(i.amount)).join(" + ")} = {inr(e.total)} (interest {inr(e.totalInterest)}).
        </p>
      ))}

      <H>Cooling-off</H>
      <p>
        Change your mind within {kfs.coolingOff.days} days (until {longDate(kfs.coolingOff.until)}): repay only what you spent, nothing else.
      </p>

      <H>Recovery</H>
      <p>Only {kfs.recovery.byPartner}&apos;s regulated process. We never contact your family, friends or college. Ever.</p>

      <H>Your data</H>
      <ul className="list-disc pl-5">
        {kfs.data.map((d) => (
          <li key={d.type}>
            <strong>{d.type.toUpperCase()}</strong> ({d.granted ? "on" : "off"}): {d.purpose}
          </li>
        ))}
      </ul>
      <p className="text-muted">Withdraw any consent or delete your data any time in Settings.</p>

      <H>Complaints</H>
      <p>
        Grievance officer: {kfs.grievance.name}, {kfs.grievance.email}, {kfs.grievance.phone}. If not resolved in {kfs.grievance.escalationDays} days, escalate to the RBI Complaint Management System
        (cms.rbi.org.in).
      </p>
      <p className="mt-4 border-t border-line pt-3 text-center text-[12px] text-muted">End of Key Fact Statement</p>
    </article>
  );
}
