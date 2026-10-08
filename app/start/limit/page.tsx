import Link from "next/link";
import { OnboardFrame } from "@/components/Frame";
import { KfsAccept, LimitChooser } from "@/components/onboarding";
import { KfsView } from "@/components/KfsView";
import { TrustStrip } from "@/components/bits";
import { loadStep } from "@/lib/page";
import { getConfig } from "@/lib/config";
import { getLine, latestDecision, brakeFor, getUser } from "@/lib/services/common";
import { latestKfs } from "@/lib/services/onboarding";
import { inr, inrPaise } from "@/lib/format";
import type { Kfs } from "@/lib/engine/kfs";

export const dynamic = "force-dynamic";

export default async function LimitPage({ searchParams }: { searchParams: { change?: string } }) {
  const { data } = await loadStep(["limit"], async (tx, userId) => {
    const u = await getUser(tx, userId);
    return {
      c: await getConfig(tx),
      d: await latestDecision(tx, userId),
      line: await getLine(tx, userId),
      kfs: await latestKfs(tx, userId),
      brake: await brakeFor(tx, u.cohort),
    };
  });
  const { c, d, line, kfs, brake } = data;
  if (!d?.offeredLimit || d.avgInflow === null) return null;
  const showKfs = line && kfs && !line.kfsAcceptedAt && searchParams.change !== "1";

  return (
    <OnboardFrame title={showKfs ? "Key Fact Statement" : "Your limit"} step={7} back={showKfs ? "/start/limit?change=1" : undefined}>
      {showKfs ? (
        <>
          <div>
            <h2 className="h-title">Read before you agree</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted">Every number below is your own, and every fee comes from our live rules. Nothing is hidden further down.</p>
          </div>
          <KfsAccept version={kfs.version}>
            <KfsView kfs={kfs.jsonSnapshot as Kfs} />
          </KfsAccept>
        </>
      ) : (
        <>
          <section className="relative overflow-hidden rounded-hero bg-teal p-5 text-white shadow-hero">
            <p className="text-[12px] font-[650] tracking-[0.02em] text-white/85">Approved by {c.partner_bank_name}</p>
            <p className="mt-3 text-[13px] text-white/70">Your credit limit offer</p>
            <p className="text-[46px] font-[780] leading-none tracking-[-0.045em] num">{inr(d.offeredLimit)}</p>
            <p className="mt-2 text-[14px] text-white/75">Use it anywhere with UPI. Pay it back in full each cycle.</p>
          </section>
          <section className="card p-4">
            <h3 className="text-[15px] font-[650]">How we got this number</h3>
            <dl className="mt-2 divide-y divide-line text-[14px]">
              <div className="flex justify-between py-2">
                <dt className="text-muted">Your average monthly inflow</dt>
                <dd className="font-[650] num">{inr(d.avgInflow)}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-muted">Our share</dt>
                <dd className="font-[650] num">× {c.limit_pct}% = {inrPaise(d.offerRaw ?? 0)}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-muted">Rounded down to the nearest {inr(c.limit_rounding)}</dt>
                <dd className="font-[650] num">{inr(Math.floor((d.offerRaw ?? 0) / c.limit_rounding) * c.limit_rounding)}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-muted">
                  Kept within {inr(c.limit_min)}–{inr(c.limit_max)}
                  {d.offerClampedBy ? ` (raised to the ${d.offerClampedBy === "min" ? "minimum" : "maximum"})` : ""}
                </dt>
                <dd className="font-[750] text-teal num">{inr(d.offeredLimit)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Why {c.limit_pct}%? So your bill never takes more than {c.limit_pct}% of what comes in, even in a big month.
            </p>
          </section>
          <p className="rounded-[12px] bg-mint px-3.5 py-3 text-[13px] leading-relaxed text-teal">
            Cooling-off: changed your mind? Cancel within {c.cooling_off_days} days at no cost. You only repay what you spent.
          </p>
          {brake !== "none" ? (
            <p className="rounded-[12px] bg-amber-soft px-3.5 py-3 text-[14px] text-amber-deep">
              New lines for your sign-up month are paused by our risk controls right now. Your approval is saved; we&apos;ll let you know when they reopen.
            </p>
          ) : (
            <LimitChooser offer={d.offeredLimit} min={c.limit_min} step={c.limit_rounding} />
          )}
          <TrustStrip partner={c.partner_bank_name} interestPct={c.interest_on_time_pct} lateFee={c.late_fee} />
          <Link href="/how-we-decide" className="btn-link self-center">
            How we decided
          </Link>
        </>
      )}
    </OnboardFrame>
  );
}
