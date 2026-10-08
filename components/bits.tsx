import Link from "next/link";
import { Icon, Logo } from "./Icon";
import { inr, ordinal } from "@/lib/format";
import type { Rung } from "@/lib/engine/ladder";

/** Small presentational pieces from the design. All values arrive as props. */

export function SandboxTag({ label = "Sandbox · simulated provider" }: { label?: string }) {
  return (
    <span className="inline-flex h-6 w-fit flex-none items-center gap-1.5 self-start rounded-full border border-dashed border-[#B9C3BC] bg-white px-2.5 text-[11px] font-semibold text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-[#9AA3AE]" aria-hidden="true" />
      {label}
    </span>
  );
}

export function TrustStrip({ partner, interestPct, lateFee }: { partner: string; interestPct: number; lateFee: number }) {
  return (
    <div role="note" aria-label="Trust and safety" className="flex items-start gap-2.5 rounded-[12px] border border-mint-line bg-mint px-3.5 py-3 text-[12px] leading-relaxed text-teal">
      <Icon name="shield" size={18} className="mt-px flex-none" />
      <p>
        Lent by <strong className="font-[650]">{partner}</strong> (RBI regulated) · {interestPct}% if paid on time · {inr(lateFee)} late fee · We never access your contacts
      </p>
    </div>
  );
}

const PILL = {
  ontime: { text: "On time", cls: "bg-mint text-teal border-[#CFE5DC]", dot: "bg-teal" },
  due: { text: "Due soon", cls: "bg-[#F1F3EF] text-ink border-[#DFE3DD]", dot: "bg-muted" },
  grace: { text: "Grace", cls: "bg-amber-soft text-amber border-[#F6D2BD]", dot: "bg-amber" },
  frozen: { text: "Frozen", cls: "bg-amber text-white border-amber", dot: "bg-white" },
  graduated: { text: "Graduated", cls: "bg-teal text-white border-teal", dot: "bg-[#B9DCCF]" },
  notyet: { text: "Not yet", cls: "bg-white text-muted border-[#DFE3DD]", dot: "bg-[#9AA3AE]" },
} as const;
export type PillKind = keyof typeof PILL;

export function StatusPill({ kind, label }: { kind: PillKind; label?: string }) {
  const k = PILL[kind];
  return (
    <span className={`inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[12px] font-[650] ${k.cls}`}>
      <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${k.dot}`} />
      {label ?? k.text}
    </span>
  );
}

export function StreakChip({ onTime, cycles }: { onTime: number; cycles: number }) {
  const clean = onTime === cycles;
  return (
    <span className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full pl-2.5 pr-3 text-[13px] font-[650] num ${clean ? "bg-mint text-teal" : "bg-amber-soft text-amber"}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.6 2.5c.5 3.2 4.9 5.4 4.9 10.6a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4.4 2.8-5.6.2 1.8 1 3 2.3 3.6-.6-3.4.2-6.2 1-8.6z" />
      </svg>
      {onTime}/{cycles} on time
    </span>
  );
}

/** One dot per cycle up to graduation; milestone dots from the configured rungs. */
export function LadderBar({ streak, rungs, baseLimit }: { streak: number; rungs: Rung[]; baseLimit: number }) {
  const total = Math.max(...rungs.map((r) => r.cycles));
  const c = Math.max(0, Math.min(total, streak));
  const label = (r: Rung) => (r.graduate ? "Card" : `${inr(r.limit!)}`);
  const milestone = new Map(rungs.map((r) => [r.cycles, r]));
  const next = rungs.find((r) => c < r.cycles);
  const nextLine = !next
    ? "graduated"
    : next.graduate
      ? `graduation at ${next.cycles} (credit card offer)`
      : `next unlock at ${next.cycles} (limit ${inr(baseLimit)} → ${inr(next.limit!)})`;
  return (
    <div role="img" aria-label={`Ladder: ${c} of ${total} on-time cycles, ${nextLine}`} className="w-full px-0.5 py-2">
      <div className="relative">
        <div aria-hidden="true" className="absolute top-1/2 -mt-px h-0.5 rounded bg-[#DCE1DB]" style={{ left: `${50 / total}%`, right: `${50 / total}%` }}>
          <div className="h-0.5 rounded bg-teal" style={{ width: c <= 1 ? "0%" : `${((c - 1) / (total - 1)) * 100}%` }} />
        </div>
        <div className="relative grid h-6 items-center" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
          {Array.from({ length: total }, (_, i) => {
            const k = i + 1;
            const done = k <= c;
            const ms = milestone.has(k);
            return (
              <div key={k} className="flex justify-center">
                <span
                  className="box-border rounded-full border-2"
                  style={{
                    width: ms ? 16 : 10,
                    height: ms ? 16 : 10,
                    background: done ? "#0F5C4D" : "#FFFFFF",
                    borderColor: done || ms ? "#0F5C4D" : "#CFD6D0",
                    boxShadow: k === c ? "0 0 0 4px #CFE7DE" : "none",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div aria-hidden="true" className="mt-1 grid h-4" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {Array.from({ length: total }, (_, i) => {
          const r = milestone.get(i + 1);
          return (
            <span key={i} className={`whitespace-nowrap text-center text-[10px] font-[650] ${i + 1 <= c ? "text-teal" : "text-muted"}`}>
              {r ? label(r) : ""}
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] text-muted">
        <strong className="font-[650] text-ink">
          {c} of {total}
        </strong>{" "}
        on-time cycles · {nextLine}
      </p>
    </div>
  );
}

export function LimitMeter({
  used,
  limit,
  nudgePct,
  variant = "light",
  paused = false,
  pausedWhy = "",
}: {
  used: number;
  limit: number;
  nudgePct: number;
  variant?: "light" | "dark";
  paused?: boolean;
  pausedWhy?: string;
}) {
  const pct = limit ? Math.round((used / limit) * 100) : 0;
  const over = pct > nudgePct;
  const width = `${Math.max(pct > 0 ? 2 : 0, Math.min(100, pct))}%`;
  if (variant === "dark") {
    return (
      <div role="meter" aria-label="Limit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="w-full">
        <div className="relative h-2 rounded-full bg-white/15">
          <div
            className="absolute inset-y-0 left-0 origin-left animate-asc-grow rounded-full"
            style={{ width, background: over ? "#F2A57A" : "#9BE0C9", boxShadow: `0 0 12px ${over ? "rgba(242,165,122,0.5)" : "rgba(155,224,201,0.45)"}` }}
          />
          <div aria-hidden="true" className="absolute -bottom-[5px] -top-[5px] w-0.5 rounded bg-white/85" style={{ left: `${nudgePct}%` }} />
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[12px] text-white/80">
          <span>{paused ? "Spends paused" : over ? `Above the ${nudgePct}% line` : `Within the ${nudgePct}% line`}</span>
          <span className="num">{pct}% used</span>
        </div>
      </div>
    );
  }
  const caption = paused
    ? pausedWhy || "Spends are paused for now."
    : pct === 0
      ? "Nothing used this cycle. Small spends paid on time keep your record growing."
      : pct < nudgePct
        ? `Under ${nudgePct}%. That reads best on your credit report.`
        : pct === nudgePct
          ? `Right on the ${nudgePct}% line. Staying at or under it reads best.`
          : `Over ${nudgePct}% of your limit. Paying some back before the due date helps your score.`;
  return (
    <section aria-label="Credit limit used" className="rounded-card border border-[rgba(20,26,34,0.07)] bg-white p-[18px] shadow-card">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-muted">Used</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[34px] font-[750] tracking-[-0.035em] num">{inr(used)}</span>
            <span className="text-[15px] text-muted">of {inr(limit)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[12px] text-muted">Available</div>
          <div className={`text-[17px] font-[650] num ${paused ? "text-muted" : "text-ink"}`}>{inr(Math.max(0, limit - used))}</div>
        </div>
      </div>
      <div role="meter" aria-label="Limit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="relative mt-4 h-2.5 rounded-full bg-mint shadow-[inset_0_1px_2px_rgba(15,92,77,0.10)]">
        <div className={`absolute inset-y-0 left-0 origin-left animate-asc-grow rounded-full ${over ? "bg-amber" : "bg-teal"}`} style={{ width }} />
        <div aria-hidden="true" className="absolute -bottom-[5px] -top-[5px] w-0.5 rounded bg-ink" style={{ left: `${nudgePct}%` }} />
      </div>
      <div aria-hidden="true" className="relative h-5 text-[11px] text-muted">
        <span className="absolute top-[5px] -translate-x-1/2 whitespace-nowrap" style={{ left: `${nudgePct}%` }}>
          {nudgePct}% line
        </span>
      </div>
      <p className={`mt-1.5 text-[13px] leading-snug ${over || paused ? "text-amber" : "text-teal"}`}>{caption}</p>
    </section>
  );
}

export function GateRow({ label, detail, status, reason }: { label: string; detail?: string; status: "wait" | "pass" | "fail" | "todo"; reason?: string }) {
  const fail = status === "fail";
  return (
    <div role="status" className={`flex items-start gap-3 rounded-[14px] border px-3.5 py-3 shadow-card transition-colors ${fail ? "border-amber-line bg-amber-soft" : "border-line bg-white"}`}>
      <span className="flex h-[26px] w-[26px] flex-none items-center justify-center">
        {status === "wait" && (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-label="Checking" style={{ animation: "ascSpin 1s linear infinite" }} strokeWidth="2.4" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" stroke="#DCE1DB" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="#0F5C4D" />
          </svg>
        )}
        {status === "todo" && <span aria-label="Not checked yet" className="h-5 w-5 rounded-full border-2 border-[#CFD6D0]" />}
        {status === "pass" && (
          <span aria-label="Passed" className="flex h-6 w-6 animate-asc-pop items-center justify-center rounded-full bg-teal text-white">
            <Icon name="check" size={14} strokeWidth={3} />
          </span>
        )}
        {fail && (
          <span aria-label="Not passed" className="flex h-6 w-6 animate-asc-pop items-center justify-center rounded-full bg-amber text-white">
            <Icon name="x" size={12} strokeWidth={3.2} />
          </span>
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className={`text-[14px] font-semibold leading-snug ${status === "wait" || status === "todo" ? "text-muted" : "text-ink"}`}>{label}</div>
        {detail && <div className="text-[12px] text-muted">{detail}</div>}
        {fail && reason && <div className="mt-1 animate-asc-in text-[13px] leading-snug text-amber">{reason}</div>}
      </div>
    </div>
  );
}

export function Stepper({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <div role="progressbar" aria-label="Onboarding progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} className="bg-paper px-4 pb-3 pt-2.5">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-[650] text-teal">
          Step {step} of {total}
        </span>
        <span className="text-muted">{label}</span>
      </div>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < step ? "bg-teal" : "bg-[#DCE6E1]"}`} />
        ))}
      </div>
    </div>
  );
}

export function AppBar({ title, back, initials, alert, mode = "app" }: { title: string; back?: string; initials?: string; alert?: boolean; mode?: "app" | "onboard" | "parent" }) {
  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center gap-1.5 border-b border-[rgba(20,26,34,0.06)] bg-[rgba(250,250,247,0.88)] pl-1.5 pr-2.5 backdrop-blur-[14px] backdrop-saturate-150">
      {back ? (
        <Link href={back} aria-label="Back" className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] text-ink hover:bg-black/5">
          <Icon name="back" />
        </Link>
      ) : (
        <div className="flex h-11 w-11 flex-none items-center justify-center">
          <Logo />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-teal">Ascend</span>
        <h1 className="truncate text-[18px] font-[720] tracking-[-0.02em]">{title}</h1>
      </div>
      {mode === "app" && (
        <div className="flex items-center gap-0.5">
          <Link href="/notifications" aria-label="Reminders" className="relative flex h-11 w-11 items-center justify-center rounded-[12px] text-ink hover:bg-black/5">
            <Icon name="bell" />
            {alert && <span className="absolute right-[11px] top-2.5 h-2 w-2 rounded-full border-2 border-paper bg-amber" />}
          </Link>
          <Link href="/settings" aria-label="Your profile and settings" className="flex h-11 w-11 items-center justify-center">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-teal text-[12px] font-bold tracking-[0.02em] text-white shadow-[0_0_0_2px_#FAFAF7,0_0_0_3px_rgba(15,92,77,0.25)]">
              {initials}
            </span>
          </Link>
        </div>
      )}
      {mode === "parent" && (
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-mint px-2.5 text-[12px] font-semibold text-teal">
          <Icon name="eye" size={14} strokeWidth={2} />
          Read-only
        </span>
      )}
    </header>
  );
}

/** The "All charges" mini-table shown on Pay, Statement and Settings. Every value from config. */
export function AllCharges({ fees }: { fees: { interestPct: number; processing: number; annual: number; late: number; foreclosure: number } }) {
  const rows: [string, string][] = [
    ["Interest if paid in full by the due date", `${fees.interestPct}%`],
    ["Processing fee", inr(fees.processing)],
    ["Annual fee", inr(fees.annual)],
    ["Late fee", inr(fees.late)],
    ["Foreclosure / early repayment", inr(fees.foreclosure)],
  ];
  return (
    <section aria-label="All charges" className="card p-4">
      <h3 className="text-[14px] font-[650]">All charges</h3>
      <dl className="mt-2 divide-y divide-line text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className="font-[650] num">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export const ordinalDay = ordinal;
