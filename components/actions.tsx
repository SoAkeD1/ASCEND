"use client";

import { useState } from "react";
import { api, Confetti, ErrorNote, useAction } from "./client";
import { inr } from "@/lib/format";

/** Small one-button actions used on several screens. Each calls one API action, then refreshes. */
export function RepayButton({ amount, label }: { amount: number; label?: string }) {
  const { busy, error, run } = useAction();
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {done && <Confetti />}
      <ErrorNote error={error} />
      <button className="btn-primary w-full" disabled={busy || amount <= 0} onClick={() => run(() => api("line/repay", {}), () => setDone(true))}>
        {busy ? "Paying…" : (label ?? `Pay ${inr(amount)} now`)}
      </button>
    </div>
  );
}

export function CoolingOffExit({ owed, until }: { owed: number; until: string }) {
  const { busy, error, run } = useAction();
  const [sure, setSure] = useState(false);
  return (
    <section className="card p-4">
      <h3 className="text-[15px] font-[650]">Changed your mind?</h3>
      <p className="mt-1 text-[13px] text-muted">
        Until {until} you can close this line by repaying only what you spent ({inr(owed)}). No interest, no fee.
      </p>
      <ErrorNote error={error} />
      {!sure ? (
        <button className="btn-secondary mt-3 w-full" onClick={() => setSure(true)}>
          Close my line
        </button>
      ) : (
        <button className="btn-amber mt-3 w-full" disabled={busy} onClick={() => run(() => api("line/cooling-exit", {}))}>
          {busy ? "Closing…" : `Yes, repay ${inr(owed)} and close`}
        </button>
      )}
    </section>
  );
}

export function HardshipChooser({ plans }: { plans: { months: number; schedule: { n: number; amount: number }[]; total: number; totalInterest: number; principal: number; ascendRevenue: number }[] }) {
  const { busy, error, run } = useAction();
  const [months, setMonths] = useState(plans[plans.length - 1]?.months);
  const plan = plans.find((p) => p.months === months);
  return (
    <section className="card p-4">
      <h3 className="text-[16px] font-[700]">Split it into a plan</h3>
      <p className="mt-1 text-[13px] text-muted">Shown upfront, on what you actually owe ({inr(plans[0]?.principal ?? 0)}). Pick the months that fit.</p>
      <div className="mt-3 flex gap-2">
        {plans.map((p) => (
          <button
            key={p.months}
            type="button"
            aria-pressed={months === p.months}
            onClick={() => setMonths(p.months)}
            className={`min-h-10 flex-1 rounded-[12px] border text-[14px] font-semibold ${months === p.months ? "border-teal bg-teal text-white" : "border-line bg-white"}`}
          >
            {p.months} months
          </button>
        ))}
      </div>
      {plan && (
        <dl className="mt-3 divide-y divide-line text-[14px]">
          {plan.schedule.map((i) => (
            <div key={i.n} className="flex justify-between py-1.5">
              <dt className="text-muted">Month {i.n}</dt>
              <dd className="font-[650] num">{inr(i.amount)}</dd>
            </div>
          ))}
          <div className="flex justify-between py-1.5">
            <dt className="text-muted">Plan interest (lender&apos;s rate)</dt>
            <dd className="font-[650] num">{inr(plan.totalInterest)}</dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="font-[650]">Total</dt>
            <dd className="font-[750] num">{inr(plan.total)}</dd>
          </div>
          <div className="flex justify-between py-1.5 text-teal">
            <dt>Ascend earns from this</dt>
            <dd className="font-[750] num">{inr(plan.ascendRevenue)}</dd>
          </div>
        </dl>
      )}
      <ErrorNote error={error} />
      <button className="btn-primary mt-3 w-full" disabled={busy || !plan} onClick={() => run(() => api("line/hardship", { months }))}>
        {busy ? "Starting…" : `Start the ${months}-month plan`}
      </button>
    </section>
  );
}

export function PayInstalmentButton({ amount, n }: { amount: number; n: number }) {
  const { busy, error, run } = useAction();
  return (
    <>
      <ErrorNote error={error} />
      <button className="btn-primary w-full" disabled={busy} onClick={() => run(() => api("line/hardship/pay", {}))}>
        {busy ? "Paying…" : `Pay instalment ${n}: ${inr(amount)}`}
      </button>
    </>
  );
}
