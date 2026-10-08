"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ErrorNote, MomentCard, Sheet, useAction } from "./client";
import { SandboxTag } from "./bits";
import { inr, longDate, ordinal } from "@/lib/format";

const CATEGORIES = ["Food", "Travel", "Books", "Stationery", "Mobile", "Other"];

type Confirm = { amount: number; dueDate: string; payday: number | null; limit: number };
type Paid = { amount: number; merchant: string; ref: string; pct: number; moments: string[] };

export function PayForm(props: {
  available: number;
  limit: number;
  outstanding: number;
  dueDate: string | null;
  nudgePct: number;
  bigPct: number;
  interestPct: number;
  fees: number;
  paused: string | null;
  prefill: { merchant?: string; amount?: string; category?: string };
}) {
  const { busy, error, run } = useAction();
  const [merchant, setMerchant] = useState(props.prefill.merchant ?? "");
  const [category, setCategory] = useState(props.prefill.category && CATEGORIES.includes(props.prefill.category) ? props.prefill.category : "Food");
  const [amount, setAmount] = useState(props.prefill.amount ?? "");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [paid, setPaid] = useState<Paid | null>(null);
  const amt = Number(amount || 0);
  const afterPct = props.limit ? Math.round(((props.outstanding + amt) / props.limit) * 100) : 0;

  const pay = (confirmed: boolean) =>
    run(
      () =>
        api<{ needsConfirm: true; amount: number; dueDate: string; payday: number | null; limit: number } | { needsConfirm: false; ref: string; utilisation: { pct: number }; moments: string[] }>("line/spend", {
          merchant,
          category,
          amount: amt,
          confirmed,
        }),
      (r) => {
        if (r.needsConfirm) setConfirm(r);
        else {
          setConfirm(null);
          setPaid({ amount: amt, merchant, ref: r.ref, pct: r.utilisation.pct, moments: r.moments });
        }
      },
    );

  if (paid) {
    return (
      <div className="flex flex-1 flex-col items-center gap-4 pt-6 text-center">
        <span className="flex h-16 w-16 animate-asc-pop items-center justify-center rounded-full bg-teal text-white">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h2 className="text-[30px] font-[780] tracking-[-0.03em] num">Paid {inr(paid.amount)}</h2>
        <p className="text-[14px] text-muted">
          To {paid.merchant} · UPI ref {paid.ref}
        </p>
        <SandboxTag />
        <p className="text-[14px]">
          You&apos;ve now used {paid.pct}% of your limit{props.dueDate ? ` · due ${longDate(props.dueDate)}` : ""}.
        </p>
        {paid.moments.includes("first_spend") && (
          <div className="w-full text-left">
            <MomentCard
              label="First spend"
              tip="Your credit record has started."
              why="Every bill you pay in full and on time is reported as a good month. Small spends build the same record as big ones."
            />
          </div>
        )}
        {paid.moments.includes("utilisation_cross") && (
          <div className="w-full text-left">
            <MomentCard
              label="Usage check"
              tone="amber"
              tip={`You're above the ${props.nudgePct}% line.`}
              why="Bureaus read high usage as stretched. Paying part of your bill early brings it down, and there's no fee to do it."
            />
          </div>
        )}
        <div className="mt-auto grid w-full grid-cols-2 gap-2">
          <Link href="/home" className="btn-secondary">
            Home
          </Link>
          <button
            className="btn-primary"
            onClick={() => {
              setPaid(null);
              setAmount("");
              setMerchant("");
            }}
          >
            Pay someone else
          </button>
        </div>
      </div>
    );
  }

  if (props.paused) {
    return (
      <div className="flex flex-col gap-3 rounded-[16px] border border-amber-line bg-amber-soft p-4">
        <strong className="text-[16px] text-amber">Spends are paused</strong>
        <p className="text-[14px] text-[#5B3A2A]">{props.paused}</p>
        <Link href="/slip" className="btn-amber">
          See what to do
        </Link>
      </div>
    );
  }

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        pay(false);
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">
          Paying from your Ascend line · <strong className="text-ink num">{inr(props.available)}</strong> available
        </p>
        <SandboxTag label="UPI sandbox" />
      </div>
      <div>
        <label htmlFor="pay-m" className="label">
          Pay to (merchant or UPI ID)
        </label>
        <input id="pay-m" className="field" value={merchant} onChange={(e) => setMerchant(e.target.value)} required maxLength={80} />
        <p className="mt-1.5 text-[12px] text-muted">
          Or scan a QR from our <Link href="/test-merchant" className="font-semibold text-teal underline">test merchant page</Link>.
        </p>
      </div>
      <div>
        <span className="label">Category</span>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`min-h-9 rounded-full border px-3.5 text-[13px] font-semibold ${category === c ? "border-teal bg-teal text-white" : "border-line bg-white text-ink"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="pay-a" className="label">
          Amount
        </label>
        <div className="flex items-center rounded-[14px] border border-[#D5DBD5] bg-white px-4 focus-within:border-teal">
          <span className="text-[30px] font-[750] text-muted">₹</span>
          <input
            id="pay-a"
            inputMode="numeric"
            className="w-full bg-transparent py-3 pl-1 text-[34px] font-[780] tracking-[-0.03em] outline-none num"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 7))}
            required
          />
        </div>
        {amt > 0 && (
          <p className={`mt-1.5 text-[12px] ${amt > props.available ? "text-amber" : afterPct > props.nudgePct ? "text-amber" : "text-muted"}`}>
            {amt > props.available
              ? `That's more than your ${inr(props.available)} available.`
              : `After this you'll have used ${afterPct}% of your limit${afterPct > props.nudgePct ? `, above the ${props.nudgePct}% line` : ""}.`}
          </p>
        )}
      </div>
      <p className="text-[12px] text-muted">
        {props.interestPct}% interest if repaid by the due date · {inr(props.fees)} fees · shows on your credit report
      </p>
      <ErrorNote error={error} />
      <div className="mt-auto">
        <button className="btn-primary w-full" disabled={busy || amt <= 0 || !merchant.trim()}>
          {busy ? "Paying…" : `Pay ${inr(amt)}`}
        </button>
      </div>
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={`That's more than ${props.bigPct}% of your limit`}>
        {confirm && (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] leading-relaxed text-muted">
              {inr(confirm.amount)} of your {inr(confirm.limit)} limit. It&apos;s due on {longDate(confirm.dueDate)}
              {confirm.payday ? `; your money usually lands on the ${ordinal(confirm.payday)}` : ""}. Make sure it fits before then.
            </p>
            <p className="text-[14px]">
              After this you&apos;ll have used <strong>{afterPct}%</strong> of your limit.
            </p>
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => pay(true)}>
              Pay {inr(confirm.amount)}
            </button>
            <button type="button" className="btn-secondary w-full" onClick={() => setConfirm(null)}>
              Change amount
            </button>
          </div>
        )}
      </Sheet>
    </form>
  );
}
