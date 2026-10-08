import { StaffShell, Stat } from "@/components/StaffShell";
import { RecomputeBrakes } from "@/components/admin";
import { requireStaffSession, actorOf } from "@/lib/auth/current";
import { withActor } from "@/lib/db/actor";
import { lenderMetrics } from "@/lib/services/lender";
import { inr, inrPaise } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lender dashboard · Ascend" };

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

export default async function LenderPage() {
  const s = await requireStaffSession(["lender", "admin"]);
  const m = await withActor(actorOf(s), (tx) => lenderMetrics(tx));
  const r = m.rules;
  const braked = m.byCohort.filter((x) => x.brake !== "none");
  const funnelSteps: [string, number][] = [
    ["Signed up", m.funnel.signups],
    ["Got a decision", m.funnel.decided],
    ["Passed Gate 1", m.funnel.gate1Pass],
    ["Passed Gate 2 (approved)", m.funnel.approved],
    ["Opened a line", m.funnel.linesOpened],
  ];
  const max = Math.max(1, ...funnelSteps.map(([, n]) => n));

  return (
    <StaffShell title="Lender dashboard" role={s.role === "admin" ? "admin" : "lender"}>
      {braked.length > 0 && (
        <div role="alert" className="rounded-[14px] border border-amber-line bg-amber-soft p-4 text-[14px] text-amber-deep">
          <strong>Risk brake on</strong> for {braked.map((b) => `${b.cohort} (${b.brake}, ${b.dpd30Pct + b.injectedPct}%)`).join(", ")}. Limit increases and new lines for those cohorts are paused
          {braked.some((b) => b.brake === "stop") ? "; new spends are stopped where the state is 'stop'" : ""}.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Credit-Ready Rate" value={pct(m.creditReady.rate)} sub={`${m.creditReady.ready} of ${m.creditReady.eligible} lines with ${r.firstScoreCycle}+ cycles, all on time`} tone="teal" />
        <Stat
          label={`${r.bureauReportDpd}+ DPD (by outstanding)`}
          value={`${m.dpd30.overallPct}%`}
          sub={`Target under ${r.dpdTargetPct}% · brake at ${r.brakePct}% · stop at ${r.stopPct}%`}
          tone={m.dpd30.overallPct >= r.brakePct ? "amber" : "teal"}
        />
        <Stat label="First-payment default" value={pct(m.firstPaymentDefault.rate)} sub={`${m.firstPaymentDefault.count} of ${m.firstPaymentDefault.of} first bills went past ${r.graceDays} grace days`} />
        <Stat label="AutoPay adoption" value={pct(m.autopay.rate)} sub={`${m.autopay.on} of ${m.autopay.of} lines`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-[16px] font-[700]">Approval funnel</h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {funnelSteps.map(([label, n]) => (
              <li key={label}>
                <div className="flex justify-between text-[13px]">
                  <span>{label}</span>
                  <span className="font-[650] num">{n}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-mint">
                  <div className="h-2 rounded-full bg-teal" style={{ width: `${(n / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-muted">
            Builder path: <strong>{m.funnel.builder}</strong> · Age-blocked: <strong>{m.funnel.ageBlocked}</strong>
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-[16px] font-[700]">Revenue by type</h2>
          <table className="mt-3 w-full text-[14px]">
            <tbody>
              {m.revenue.map((x) => (
                <tr key={x.type} className="border-b border-line">
                  <td className="py-2 capitalize">{x.type.replace(/_/g, " ")}</td>
                  <td className="py-2 text-right font-[650] num">{inrPaise(x.amount)}</td>
                </tr>
              ))}
              <tr className="bg-mint">
                <td className="px-2 py-2 font-[700] text-teal">Late-fee revenue</td>
                <td className="px-2 py-2 text-right font-[780] text-teal num">{inr(m.lateFeeRevenue)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-muted">There is no late-fee revenue type in the ledger, so this row can never be anything but zero.</p>
          <h3 className="mt-4 text-[14px] font-[650]">Line status mix</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
            {Object.entries(m.statusMix).map(([k, v]) => (
              <span key={k} className="rounded-full bg-[#F1F3EF] px-2.5 py-1">
                {k.replace("_", " ")}: <strong>{v}</strong>
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="card overflow-x-auto p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-[700]">Cohorts and risk brake</h2>
          <RecomputeBrakes />
        </div>
        <table className="mt-3 w-full min-w-[720px] text-left text-[14px]">
          <thead className="text-[12px] text-muted">
            <tr className="border-b border-line">
              <th className="py-2">Cohort (sign-up month)</th>
              <th>Lines</th>
              <th>Outstanding</th>
              <th>{r.bureauReportDpd}+ DPD</th>
              <th>Brake</th>
              <th>Default-loss guarantee used / cap ({r.dlgCapPct}%)</th>
            </tr>
          </thead>
          <tbody>
            {m.byCohort.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-muted">
                  No lines yet.
                </td>
              </tr>
            )}
            {m.byCohort.map((x) => (
              <tr key={x.cohort} className="border-b border-line">
                <td className="py-2 font-semibold">{x.cohort}</td>
                <td className="num">{x.lines}</td>
                <td className="num">{inr(x.outstanding)}</td>
                <td className="num">
                  {x.dpd30Pct}%{x.injectedPct > 0 ? ` (+${x.injectedPct}% demo)` : ""}
                </td>
                <td>
                  <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${x.brake === "none" ? "bg-mint text-teal" : "bg-amber text-white"}`}>{x.brake}</span>
                </td>
                <td className="num">
                  {inr(x.dlgUsed)} / {inr(x.dlgCap)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-[12px] text-muted">Every figure is computed from database rows when this page loads. Partner: {r.partner}.</p>
    </StaffShell>
  );
}
