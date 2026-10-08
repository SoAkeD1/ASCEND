import Link from "next/link";
import { Icon, Logo } from "@/components/Icon";
import { withActor, SYSTEM } from "@/lib/db/actor";
import { getConfig } from "@/lib/config";
import { currentSession } from "@/lib/auth/current";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const c = await withActor(SYSTEM, (tx) => getConfig(tx));
  const signedIn = Boolean(await currentSession());
  const grad = c.ladder.find((r) => "action" in r)?.cycles;
  const cta = signedIn ? { href: "/home", label: "Open Ascend" } : { href: "/signup", label: "Get started" };

  const steps = [
    { n: 1, tag: "Minutes", t: "Connect", b: "Sign up with your email. Verify your identity. Share your bank statement so we can see how money comes in." },
    { n: 2, tag: "Instant", t: "Get your limit", b: `${c.limit_pct}% of your average monthly inflow, between ${inr(c.limit_min)} and ${inr(c.limit_max)}. Every rupee explained.` },
    { n: 3, tag: "Any UPI QR", t: "Pay with UPI", b: `Scan and pay. Clear the full bill by your due date: ${c.interest_on_time_pct}% interest, ${inr(c.late_fee)} late fee.` },
    { n: 4, tag: grad ? `${grad} cycles` : "Over time", t: "Build and climb", b: "On-time cycles build your record and grow your limit. Keep going and graduate to a real credit card." },
  ];
  const rows: [string, string, string, string, string][] = [
    ["Builds your own credit record", "No", "No: it builds your parent's", "Sometimes", "Yes, reported every cycle"],
    ["Interest if you pay on time", "None: it's your money", "0%, high if carried over", "Often high, plus fees", `${c.interest_on_time_pct}%`],
    ["Late fee", "Not applicable", "Yes", "Yes, can add up daily", `${inr(c.late_fee)}, with ${c.grace_days} grace days`],
    ["How you're approved", "Anyone with an account", "Your parent decides", "Often opaque", "Your cash flow, explained"],
    ["Privacy", "Private", "Parent sees every purchase", "Some ask for contacts", "Never contacts, photos or SMS"],
  ];

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b border-[rgba(20,26,34,0.06)] bg-[rgba(250,250,247,0.88)] backdrop-blur-[14px]">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Logo />
          <span className="text-[18px] font-[780] tracking-[-0.02em]">Ascend</span>
          <nav className="ml-auto hidden items-center gap-6 text-[14px] font-semibold text-muted sm:flex">
            <a href="#how">How it works</a>
            <Link href="/how-we-decide">How we decide</Link>
            <Link href="/parents">For parents</Link>
          </nav>
          <Link href={cta.href} className="btn-primary ml-auto min-h-[40px] px-4 text-[14px] sm:ml-4">
            {cta.label}
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-[1.1fr_0.9fr] md:py-20">
        <div className="animate-asc-in">
          <p className="eyebrow">For students 18+ · Lent by {c.partner_bank_name}</p>
          <h1 className="mt-3 text-[40px] font-[800] leading-[1.05] tracking-[-0.045em] md:text-[58px]">Your first credit score, without asking your dad.</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
            A small UPI credit line of {inr(c.limit_min)}–{inr(c.limit_max)}. Pay in full each cycle and it costs nothing. We approve you on how money flows into your bank, not on a credit score you
            don&apos;t have yet.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={cta.href} className="btn-primary px-6">
              {cta.label}
            </Link>
            <Link href="/how-we-decide" className="btn-secondary px-6">
              See how we decide
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-muted">No paperwork · We never read your contacts, photos or SMS</p>
        </div>
        <div className="relative mx-auto w-full max-w-[380px]">
          <div className="relative overflow-hidden rounded-hero bg-teal p-6 text-white shadow-hero">
            <svg aria-hidden="true" width="240" height="190" viewBox="0 0 240 190" fill="none" stroke="#FFFFFF" className="absolute -right-6 -top-1.5 opacity-[0.13]" strokeWidth="2" strokeLinejoin="round">
              <path d="M0 190h48v-38h48v-38h48V76h48V38h48V0" />
            </svg>
            <div className="relative flex items-center gap-2 text-[12px] font-[650] text-white/85">
              <Logo size={22} light /> Ascend line · {c.partner_bank_name}
            </div>
            <p className="relative mt-6 text-[13px] text-white/70">Starting limits</p>
            <p className="relative text-[40px] font-[780] leading-none tracking-[-0.04em]">
              {inr(c.limit_min)}–{inr(c.limit_max)}
            </p>
            <p className="relative mt-3 text-[14px] text-white/75">Grows to {inr(c.ladder_max)} by paying on time, not by asking.</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2.5 text-center">
            {[
              [`${c.interest_on_time_pct}%`, "interest on time"],
              [inr(c.late_fee), "late fee"],
              [`${c.grace_days} days`, "grace"],
            ].map(([big, small]) => (
              <div key={small} className="card p-3">
                <p className="text-[20px] font-[780] text-teal">{big}</p>
                <p className="text-[12px] text-muted">{small}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-[30px] font-[780] tracking-[-0.035em]">How it works</h2>
        <p className="mt-2 text-muted">Four steps. No branch visit, no guarantor, no parent&apos;s card.</p>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="card p-5">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal font-bold text-white">{s.n}</span>
                <span className="rounded-full bg-mint px-2.5 py-1 text-[12px] font-semibold text-teal">{s.tag}</span>
              </div>
              <h3 className="mt-3 text-[18px] font-[700]">{s.t}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{s.b}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-[30px] font-[780] tracking-[-0.035em]">How Ascend compares</h2>
        <p className="mt-2 text-muted">The honest version. Every option has a place; only one builds your own record safely.</p>
        <div className="mt-6 overflow-x-auto rounded-card border border-line bg-white shadow-card">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th className="p-4 font-semibold" />
                <th className="p-4 font-semibold">Debit card</th>
                <th className="p-4 font-semibold">Parent&apos;s card</th>
                <th className="p-4 font-semibold">Loan apps</th>
                <th className="bg-mint p-4 font-bold text-teal">Ascend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[0]} className="border-b border-line last:border-0">
                  <th className="p-4 font-semibold">{r[0]}</th>
                  <td className="p-4 text-muted">{r[1]}</td>
                  <td className="p-4 text-muted">{r[2]}</td>
                  <td className="p-4 text-muted">{r[3]}</td>
                  <td className="bg-mint/60 p-4 font-semibold text-teal">{r[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 md:grid-cols-2">
        <div className="card p-6">
          <p className="eyebrow">How we decide</p>
          <h3 className="mt-2 text-[22px] font-[750]">Two checks. No mystery.</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            KYC and {c.min_age}+ → Gate 1: no active unpaid loan → Gate 2: at least {inr(c.min_inflow)} a month coming in, {c.min_history_months}+ months of history, no bounce in {c.bounce_lookback_days}{" "}
            days. Not ready yet? You get a Builder path with the exact reason and a re-check date.
          </p>
          <Link href="/how-we-decide" className="btn-link mt-2 inline-block">
            See the full decision flow
          </Link>
        </div>
        <div className="card p-6">
          <p className="eyebrow">For parents</p>
          <h3 className="mt-2 text-[22px] font-[750]">Small limits. Zero surprises. Nobody calls you.</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            The limit is {c.limit_pct}% of what lands in their account. If they&apos;re late, spends pause; the fee is {inr(c.late_fee)}, and we never contact family. Read it in English or हिंदी.
          </p>
          <Link href="/parents" className="btn-link mt-2 inline-block">
            Read the parent guide
          </Link>
        </div>
      </section>

      <section className="bg-ink py-14 text-center text-white">
        <h2 className="text-[30px] font-[780] tracking-[-0.035em]">
          Start with {inr(c.limit_min)}–{inr(c.limit_max)}.
        </h2>
        <p className="mt-2 text-[#C7CDD4]">Your limit grows when you pay on time, not when you ask.</p>
        <Link href={cta.href} className="btn-primary mt-6 px-8">
          {cta.label}
        </Link>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-[12px] text-muted sm:flex-row sm:justify-between">
        <p>Ascend · a CaseBlitz 2026 prototype. {c.partner_bank_name} is a fictional lender used for this demo.</p>
        <p className="flex items-center gap-3">
          <Link href="/test-merchant" className="underline">
            Test merchant (sandbox)
          </Link>
          <span>Grievances: Settings · RBI escalation after {c.grievance_escalation_days} days</span>
          <Icon name="shield" size={14} />
        </p>
      </footer>
    </div>
  );
}
