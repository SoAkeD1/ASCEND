import Link from "next/link";
import { OnboardFrame } from "@/components/Frame";
import { RecheckButton } from "@/components/onboarding";
import { loadStep } from "@/lib/page";
import { latestDecision } from "@/lib/services/common";
import { getConfig } from "@/lib/config";
import { todayFor } from "@/lib/clock";
import { bounceClearsOn, builderProgress, type ReasonKey } from "@/lib/engine/underwriting";
import { daysBetween } from "@/lib/engine/dates";
import { firstName, inr, longDate } from "@/lib/format";
import { getUser } from "@/lib/services/common";

export const dynamic = "force-dynamic";

const REASONS: Record<Exclude<ReasonKey, "under_age">, { gate: string; title: string; unit: (n: number) => string; tips: string[] }> = {
  active_default: {
    gate: "Gate 1 · Credit record",
    title: "An unpaid loan elsewhere",
    unit: inr,
    tips: ["Clear or settle the overdue amount with that lender.", "Ask them for a no-dues letter; bureaus update within a few weeks.", "Then tap Re-check. Nothing else is held against you."],
  },
  low_inflow: {
    gate: "Gate 2 · Money coming in",
    title: "Monthly inflow is below our minimum",
    unit: inr,
    tips: ["Have your pocket money, stipend or part-time pay land in this one account.", "Upload a fresh statement once a bigger month has passed.", "Your limit is a share of inflow, so this keeps your bill comfortable."],
  },
  short_history: {
    gate: "Gate 2 · History",
    title: "Not enough months to see a pattern",
    unit: (n) => `${n} month${n === 1 ? "" : "s"}`,
    tips: ["Keep using the same account so its history grows.", "Upload a longer statement if your bank allows it.", "Re-check as soon as another month has passed."],
  },
  recent_bounce: {
    gate: "Gate 2 · Bounced payments",
    title: "A payment bounced recently",
    unit: (n) => `${n} days`,
    tips: ["Keep a little buffer before any auto-debit date.", "A bounce stops counting once it is older than our look-back window.", "Nothing else about it is held against you."],
  },
};

export default async function BuilderPage() {
  const { data } = await loadStep(["builder"], async (tx, userId) => ({
    d: await latestDecision(tx, userId),
    c: await getConfig(tx),
    today: await todayFor(tx, userId),
    u: await getUser(tx, userId),
  }));
  const { d, c, today, u } = data;
  if (!d || !d.reasonKey || d.reasonKey === "under_age") return null;
  const r = REASONS[d.reasonKey as Exclude<ReasonKey, "under_age">];
  const actual = d.actualValue ?? 0;
  const required = d.requiredValue ?? 0;
  const progress = builderProgress(d.reasonKey as ReasonKey, actual, required);
  const recheckIn = d.recheckAt ? Math.max(0, daysBetween(today, d.recheckAt)) : null;
  const goalLine =
    d.reasonKey === "active_default"
      ? `${inr(actual)} overdue · needs to be ${inr(0)}`
      : d.reasonKey === "recent_bounce"
        ? `${actual} days since the bounce · needs more than ${required} (clears on ${longDate(bounceClearsOn(d.lastBounceDate!, c))})`
        : `${r.unit(actual)} now · needs ${r.unit(required)}`;

  return (
    <OnboardFrame title="Builder path" step={6}>
      <div>
        <h2 className="h-title">Not yet, and here&apos;s exactly why</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{firstName(u.fullName)}, this isn&apos;t a rejection. It&apos;s one fixable thing, and a date we&apos;ll look again.</p>
      </div>
      <section className="card p-4">
        <p className="eyebrow">{r.gate}</p>
        <h3 className="mt-1 text-[17px] font-[700]">{r.title}</h3>
        <p className="mt-1 text-[14px] text-muted">{goalLine}</p>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="mt-3 h-2.5 rounded-full bg-mint">
          <div className="h-2.5 origin-left animate-asc-grow rounded-full bg-teal" style={{ width: `${Math.max(2, progress * 100)}%` }} />
        </div>
        <p className="mt-1.5 text-right text-[12px] text-muted num">{Math.round(progress * 100)}% of the way</p>
      </section>
      {recheckIn !== null && (
        <section className="card flex items-center gap-4 p-4">
          <div className="flex h-16 w-16 flex-none flex-col items-center justify-center rounded-[14px] bg-mint text-teal">
            <span className="text-[22px] font-[780] leading-none">{recheckIn}</span>
            <span className="text-[11px] font-semibold">days</span>
          </div>
          <div>
            <div className="text-[15px] font-[650]">Re-check on {longDate(d.recheckAt!)}</div>
            <div className="text-[13px] text-muted">Automatic. Or re-upload and re-check any time.</div>
          </div>
        </section>
      )}
      <section className="card p-4">
        <h3 className="text-[15px] font-[650]">What helps</h3>
        <ol className="mt-2 flex flex-col gap-2 text-[14px]">
          {r.tips.map((t, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-mint text-[12px] font-bold text-teal">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </section>
      <div className="flex justify-center gap-5">
        <Link href="/how-we-decide" className="btn-link">
          How we decide
        </Link>
        <Link href="/parents" className="btn-link">
          Explain to parents
        </Link>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        {d.reasonKey !== "active_default" && (
          <Link href="/start/cashflow" className="btn-secondary w-full">
            Update my statement
          </Link>
        )}
        <RecheckButton />
      </div>
    </OnboardFrame>
  );
}
