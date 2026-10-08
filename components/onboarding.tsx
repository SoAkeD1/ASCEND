"use client";

import { useMemo, useRef, useState } from "react";
import { api, Confetti, ErrorNote, useAction } from "./client";
import { GateRow, SandboxTag } from "./bits";
import { Icon } from "./Icon";
import { inr, longDate, monthLabel, ordinal } from "@/lib/format";

const Footer = ({ children }: { children: React.ReactNode }) => <div className="mt-auto flex flex-col gap-2 pt-3">{children}</div>;

// ---------- 1. Profile + date of birth ----------
export function ProfileForm({ today, minAge }: { today: string; minAge: number }) {
  const { busy, error, run, router } = useAction({ refresh: false });
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const age = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
    const [by, bm, bd] = dob.split("-").map(Number);
    const [ty, tm, td] = today.split("-").map(Number);
    return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
  }, [dob, today]);
  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => api<{ blocked: boolean }>("onboarding/profile", { fullName, dob }), (r) => router.push(r.blocked ? "/start/age-block" : "/start/kyc"));
      }}
    >
      <div>
        <h2 className="h-title">Tell us about you</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">Your name as on your PAN, and your birthday. Ascend is for {minAge}+.</p>
      </div>
      <div>
        <label htmlFor="p-name" className="label">
          Full name
        </label>
        <input id="p-name" className="field" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} />
      </div>
      <div>
        <label htmlFor="p-dob" className="label">
          Date of birth
        </label>
        <input id="p-dob" className="field" type="date" max={today} value={dob} onChange={(e) => setDob(e.target.value)} required />
      </div>
      {age !== null && age >= 0 && (
        <div className={`flex items-center gap-2 rounded-[12px] px-3.5 py-3 text-[14px] font-semibold ${age >= minAge ? "bg-mint text-teal" : "bg-[#F1F3EF] text-[#3E4753]"}`}>
          <Icon name="info" size={18} />
          {age >= minAge ? `You're ${age}. You can apply.` : `You're ${age}. Ascend opens at ${minAge}.`}
        </div>
      )}
      <ErrorNote error={error} />
      <Footer>
        <button className="btn-primary w-full" disabled={busy || fullName.trim().length < 2 || age === null}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </Footer>
    </form>
  );
}

// ---------- 2. KYC (sandbox DigiLocker) ----------
export function KycForm({ done }: { done: { panLast4: string; aadhaarLast4: string } | null }) {
  const { busy, error, run, router } = useAction({ refresh: false });
  const [pan, setPan] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [result, setResult] = useState(done);
  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (result) return router.push("/start/enrolment");
        run(() => api<{ panLast4: string; aadhaarLast4: string }>("onboarding/kyc", { pan, aadhaar }), (r) => setResult(r));
      }}
    >
      <div>
        <h2 className="h-title">Prove it&apos;s you</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
          In production this is one tap with DigiLocker. Here, type your PAN and Aadhaar: we check the format and keep only the <strong>last 4</strong> characters of each.
        </p>
      </div>
      <SandboxTag />
      <section className="card p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-mint text-teal">
            <Icon name="doc" />
          </span>
          <div className="flex-1">
            <div className="text-[15px] font-[650]">DigiLocker (sandbox)</div>
            <div className="text-[12px] text-muted">Government of India document wallet</div>
          </div>
        </div>
        {!result && (
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <label htmlFor="k-pan" className="label">
                PAN
              </label>
              <input id="k-pan" className="field uppercase tracking-[0.12em]" maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} autoComplete="off" required />
            </div>
            <div>
              <label htmlFor="k-aad" className="label">
                Aadhaar number
              </label>
              <input id="k-aad" className="field tracking-[0.12em] num" inputMode="numeric" maxLength={14} value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/[^\d ]/g, ""))} autoComplete="off" required />
            </div>
          </div>
        )}
        <p className="mt-3 text-[12px] text-muted">Aadhaar is stored masked, as RBI requires. We never see document photos.</p>
      </section>
      {busy && <GateRow label="Checking with the sandbox provider…" status="wait" />}
      {result && (
        <div className="flex flex-col gap-2">
          <GateRow label="PAN verified" detail={`Stored as ••••••${result.panLast4}`} status="pass" />
          <GateRow label="Aadhaar verified" detail={`Stored as XXXX XXXX ${result.aadhaarLast4}`} status="pass" />
        </div>
      )}
      <ErrorNote error={error} />
      <Footer>
        <button className="btn-primary w-full" disabled={busy || (!result && (pan.length !== 10 || aadhaar.replace(/\s/g, "").length !== 12))}>
          {result ? "Continue" : busy ? "Checking…" : "Verify"}
        </button>
      </Footer>
    </form>
  );
}

// ---------- 3. Enrolment ----------
export function EnrolmentForm() {
  const { busy, error, run, router } = useAction({ refresh: false });
  const [method, setMethod] = useState<"id_upload" | "college_email" | null>(null);
  const [college, setCollege] = useState("");
  const [course, setCourse] = useState("");
  const [year, setYear] = useState(1);
  const [fileName, setFileName] = useState("");
  const [email, setEmail] = useState("");
  const academic = /@[^@\s]+\.(edu|ac\.in|edu\.in)$/i.test(email.trim());
  const proofOk = method === "id_upload" ? fileName !== "" : method === "college_email" ? academic : false;
  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => api("onboarding/enrolment", { college, course, year, method }), () => router.push("/start/consent"));
      }}
    >
      <div>
        <h2 className="h-title">Show you&apos;re a student</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">Ascend&apos;s limits and reminders are built around pocket money and stipends.</p>
      </div>
      <div className="grid gap-3">
        <div>
          <label htmlFor="e-col" className="label">
            College
          </label>
          <input id="e-col" className="field" value={college} onChange={(e) => setCollege(e.target.value)} required />
        </div>
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <div>
            <label htmlFor="e-course" className="label">
              Course
            </label>
            <input id="e-course" className="field" value={course} onChange={(e) => setCourse(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="e-year" className="label">
              Year
            </label>
            <select id="e-year" className="field" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold">Proof of enrolment</span>
        <SandboxTag />
      </div>
      <label className={`card flex cursor-pointer flex-col gap-1 p-4 ${method === "id_upload" ? "border-2 border-teal" : ""}`}>
        <span className="flex items-center gap-2 text-[15px] font-[650]">
          <Icon name="upload" className="text-teal" /> Upload your college ID
        </span>
        <span className="text-[13px] text-muted">{fileName ? `${fileName} · checked, not stored` : "Choose an image or PDF. In the sandbox we only check a file was chosen; nothing is uploaded."}</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(e) => {
            setFileName(e.target.files?.[0]?.name ?? "");
            setMethod("id_upload");
          }}
        />
      </label>
      <div className="flex items-center gap-3 text-[12px] text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className={`card p-4 ${method === "college_email" ? "border-2 border-teal" : ""}`}>
        <label htmlFor="e-mail" className="label">
          Your college email
        </label>
        <input
          id="e-mail"
          className="field"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setMethod("college_email");
          }}
        />
        <p className={`mt-1.5 text-[12px] ${email && !academic ? "text-amber" : "text-muted"}`}>
          {email && !academic ? "That doesn't look like a college address (.edu, .ac.in or .edu.in)." : "Sandbox: we check the domain only."}
        </p>
      </div>
      <ErrorNote error={error} />
      <Footer>
        <button className="btn-primary w-full" disabled={busy || !proofOk || college.trim().length < 2 || course.trim().length < 2}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </Footer>
    </form>
  );
}

// ---------- 4. Consent centre ----------
type ConsentRow = { type: "kyc" | "aa" | "bureau" | "family_share"; purpose: string; granted: boolean };
const CONSENT_TITLES: Record<string, { title: string; source: string }> = {
  kyc: { title: "Identity (KYC)", source: "DigiLocker · PAN and Aadhaar" },
  aa: { title: "Bank statements", source: "Account Aggregator · read for this decision" },
  bureau: { title: "Credit bureau check", source: "Soft check · won't lower your score" },
};

export function Toggle({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`flex h-[30px] w-[50px] flex-none items-center rounded-full p-[3px] transition-colors ${on ? "justify-end bg-teal" : "justify-start bg-[#CBD3CC]"}`}
    >
      <span className="h-6 w-6 rounded-full bg-white shadow" />
    </button>
  );
}

export function ConsentForm({ initial }: { initial: ConsentRow[] }) {
  const { busy, error, run, router } = useAction({ refresh: false });
  const [rows, setRows] = useState(initial.filter((r) => r.type !== "family_share"));
  const all = rows.every((r) => r.granted);
  const set = (type: string, granted: boolean) =>
    run(() => api("consents", { type, granted }), () => setRows((rs) => rs.map((r) => (r.type === type ? { ...r, granted } : r))));
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h2 className="h-title">You decide what we see</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">Three things, each with a reason. All start off. Switch them on to continue; withdraw any of them later in Settings.</p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.type} className={`card flex items-start gap-3 p-4 ${r.granted ? "border-[#BFDDD2]" : ""}`}>
            <div className="flex-1">
              <div className="text-[15px] font-[650]">{CONSENT_TITLES[r.type].title}</div>
              <div className="text-[12px] text-muted">{CONSENT_TITLES[r.type].source}</div>
              <p className="mt-1.5 text-[13px] leading-snug">
                <strong className="font-[650]">Why we need this:</strong> {r.purpose}
              </p>
            </div>
            <Toggle on={r.granted} label={CONSENT_TITLES[r.type].title} onChange={(v) => set(r.type, v)} disabled={busy} />
          </li>
        ))}
      </ul>
      <section aria-labelledby="never-h" className="rounded-[16px] bg-ink p-4 text-white">
        <div className="flex items-center gap-2">
          <Icon name="shield" className="text-[#7CC4AE]" />
          <h3 id="never-h" className="text-[15px] font-[700]">
            We will NEVER access
          </h3>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[13px] text-[#C9D0D8]">
          {["Contacts", "Photos", "SMS", "Social media"].map((x) => (
            <span key={x} className="flex items-center gap-2 rounded-[10px] bg-white/5 px-3 py-2">
              <Icon name="x" size={14} className="text-[#AEB6C0]" />
              {x}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-[#AEB6C0]">Not now, not later, not for marketing. The app doesn&apos;t even ask for those phone permissions.</p>
      </section>
      <ErrorNote error={error} />
      <Footer>
        <button className="btn-primary w-full" disabled={!all || busy} onClick={() => router.push("/start/bureau")}>
          {all ? "Continue" : `${rows.filter((r) => r.granted).length} of ${rows.length} switched on`}
        </button>
      </Footer>
    </div>
  );
}

// ---------- 5. Bureau (Gate 1, self-declared in the sandbox) ----------
const BUREAU_OPTIONS = [
  { status: "none", title: "I've never had a loan or card", body: "Totally fine. No history is not a bad history." },
  { status: "thin", title: "I've had one for a short while", body: "A thin file is fine too." },
  { status: "clean", title: "I've had loans and paid them on time", body: "Great, that helps nothing here and hurts nothing." },
  { status: "active_default", title: "I have a loan that's overdue right now", body: "Be honest; this is the one thing we check. It's fixable." },
] as const;

export function BureauForm({ sourceLabel }: { sourceLabel: string }) {
  const { busy, error, run, router } = useAction({ refresh: false });
  const [status, setStatus] = useState<(typeof BUREAU_OPTIONS)[number]["status"] | null>(null);
  const [amount, setAmount] = useState("");
  const overdue = status === "active_default";
  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          async () => {
            await api("onboarding/bureau", { status, overdueAmount: overdue ? Number(amount) : 0 });
            if (overdue) await api("onboarding/underwrite", {});
          },
          () => router.push(overdue ? "/start/builder" : "/start/cashflow"),
        );
      }}
    >
      <div>
        <h2 className="h-title">One quick look at your record</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">We only check for one thing here: an active unpaid loan. No history is completely fine.</p>
      </div>
      <div className="flex items-center gap-2">
        <SandboxTag />
        <span className="text-[12px] text-muted">Recorded as &quot;{sourceLabel}&quot;</span>
      </div>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="sr-only">Your credit record</legend>
        {BUREAU_OPTIONS.map((o) => (
          <label key={o.status} className={`card flex cursor-pointer items-start gap-3 p-4 ${status === o.status ? "border-2 border-teal" : ""}`}>
            <input type="radio" name="bureau" value={o.status} aria-label={o.title} className="mt-1 accent-[#0F5C4D]" checked={status === o.status} onChange={() => setStatus(o.status)} />
            <span>
              <span className="block text-[15px] font-[650]">{o.title}</span>
              <span className="text-[13px] text-muted">{o.body}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {overdue && (
        <div className="animate-asc-in">
          <label htmlFor="b-amt" className="label">
            How much is overdue? (₹)
          </label>
          <input id="b-amt" className="field num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} required />
        </div>
      )}
      <p className="rounded-[12px] bg-mint px-3.5 py-3 text-[13px] leading-relaxed text-teal">
        What doesn&apos;t count against you: having no credit history, a thin file, your marks, or your college&apos;s ranking.
      </p>
      <ErrorNote error={error} />
      <Footer>
        <button className="btn-primary w-full" disabled={busy || !status || (overdue && !(Number(amount) > 0))}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </Footer>
    </form>
  );
}

// ---------- 6. Cash flow (Gate 2) ----------
type Rules = { minInflow: number; minHistory: number; lookback: number };
type Summary = { avgMonthlyInflow: number; historyMonths: number; lastBounceDate: string | null; payday: number | null; months: { month: string; credits: number }[] };
type Decision = { decision: "approved" | "builder" | "age_block"; reasonKey: string | null; actualValue: number | null; requiredValue: number | null; offer: { offer: number } | null };

export function CashFlowForm({ rules, today, initial }: { rules: Rules; today: string; initial: Summary | null }) {
  const { busy, error, run, router, setError } = useAction({ refresh: false });
  const [mode, setMode] = useState<"csv" | "manual">("csv");
  const [keepFile, setKeepFile] = useState(false);
  const [parseErrors, setParseErrors] = useState<{ line: number; reason: string }[]>([]);
  const [imported, setImported] = useState<number | null>(null);
  const [rows, setRows] = useState<{ month: string; amount: string }[]>(() => {
    const [y, m] = today.split("-").map(Number);
    return Array.from({ length: rules.minHistory }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 2 - i, 1));
      return { month: d.toISOString().slice(0, 7), amount: "" };
    }).reverse();
  });
  const [summary, setSummary] = useState<Summary | null>(initial);
  const [decision, setDecision] = useState<Decision | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    const text = await file.text();
    await run(
      () => api<{ imported: number; errors: { line: number; reason: string }[] }>("onboarding/statement", { filename: file.name, text, keepFile }),
      (r) => {
        setImported(r.imported);
        setParseErrors(r.errors);
        if (r.imported === 0) setError("We couldn't read any rows from that file. See the problems below.");
      },
    );
  }

  const check = () =>
    run(
      async () => {
        if (mode === "manual") {
          const entries = rows.filter((r) => r.amount !== "").map((r) => ({ month: r.month, amount: Number(r.amount) }));
          await api("onboarding/manual", { entries });
        }
        return api<{ decision: Decision; inflow: Summary }>("onboarding/underwrite", {});
      },
      (r) => {
        setSummary(r.inflow);
        setDecision(r.decision);
      },
    );

  const s = summary;
  const daysSinceBounce = s?.lastBounceDate ? Math.round((Date.parse(today) - Date.parse(s.lastBounceDate)) / 86_400_000) : null;
  const rowsState = (ok: boolean | null) => (decision === null ? "todo" : ok ? "pass" : "fail");
  const g = decision
    ? {
        inflow: s!.avgMonthlyInflow >= rules.minInflow,
        history: s!.historyMonths >= rules.minHistory,
        bounce: daysSinceBounce === null || daysSinceBounce > rules.lookback,
      }
    : null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h2 className="h-title">Share how money comes in</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">This sets your limit, instead of a credit score. In production this comes through an RBI-licensed Account Aggregator.</p>
      </div>
      <SandboxTag />
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-[14px] bg-[#EEF1EC] p-1 text-[14px] font-semibold">
        {(["csv", "manual"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => setMode(m)} className={`min-h-[40px] rounded-[10px] ${mode === m ? "bg-white text-teal shadow-card" : "text-muted"}`}>
            {m === "csv" ? "Upload statement (CSV)" : "Type monthly amounts"}
          </button>
        ))}
      </div>

      {mode === "csv" ? (
        <section className="card flex flex-col gap-3 p-4">
          <p className="text-[13px] leading-relaxed text-muted">
            A CSV with columns <code className="rounded bg-[#F1F3EF] px-1">date, description, credit, debit</code> (balance optional). Most banks let you download one. Rows with RETURN, BOUNCE or
            INSUFFICIENT count as bounces.
          </p>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="accent-[#0F5C4D]" checked={keepFile} onChange={(e) => setKeepFile(e.target.checked)} />
            Keep my file (otherwise it&apos;s deleted right after reading)
          </label>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Choose CSV file
          </button>
          {imported !== null && imported > 0 && <p className="text-[13px] font-semibold text-teal">Read {imported} rows.</p>}
          {parseErrors.length > 0 && (
            <ul className="max-h-32 overflow-auto rounded-[10px] bg-amber-soft p-3 text-[12px] text-amber-deep">
              {parseErrors.slice(0, 20).map((e) => (
                <li key={e.line}>
                  Line {e.line}: {e.reason}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="card flex flex-col gap-2.5 p-4">
          <p className="text-[13px] text-muted">Total money that came in each month. Typed totals have no dates, so we won&apos;t guess your payday.</p>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_36px] items-center gap-2">
              <input
                aria-label="Month"
                type="month"
                className="field py-2"
                value={r.month}
                max={today.slice(0, 7)}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, month: e.target.value } : x)))}
              />
              <input
                aria-label={`Amount for ${r.month}`}
                className="field py-2 num"
                inputMode="numeric"
                placeholder="₹"
                value={r.amount}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/\D/g, "") } : x)))}
              />
              <button type="button" aria-label="Remove month" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-black/5" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-link self-start"
            onClick={() => {
              const first = rows[0]?.month ?? today.slice(0, 7);
              const [y, m] = first.split("-").map(Number);
              const d = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
              setRows([{ month: d, amount: "" }, ...rows]);
            }}
          >
            + Add an earlier month
          </button>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-[14px] font-[650]">Three checks, every result shown</h3>
        <GateRow
          label={s && decision ? `Average monthly inflow: ${inr(s.avgMonthlyInflow)}` : "Average monthly inflow"}
          detail={`Needs ${inr(rules.minInflow)}+`}
          status={busy ? "wait" : rowsState(g?.inflow ?? null)}
          reason={s ? `${inr(s.avgMonthlyInflow)} a month is below the ${inr(rules.minInflow)} we need to keep your bill comfortable.` : undefined}
        />
        <GateRow
          label={s && decision ? `History: ${s.historyMonths} month${s.historyMonths === 1 ? "" : "s"}` : "Months of history"}
          detail={`Needs ${rules.minHistory}+ months`}
          status={busy ? "wait" : rowsState(g?.history ?? null)}
          reason={s ? `We can see ${s.historyMonths} month${s.historyMonths === 1 ? "" : "s"}; we need ${rules.minHistory} to judge a pattern.` : undefined}
        />
        <GateRow
          label={s && decision ? (s.lastBounceDate ? `Last bounce: ${longDate(s.lastBounceDate)}` : "No bounced payments") : "Bounced payments"}
          detail={`None in the last ${rules.lookback} days`}
          status={busy ? "wait" : rowsState(g?.bounce ?? null)}
          reason={daysSinceBounce !== null ? `A payment bounced ${daysSinceBounce} days ago. It stops counting after ${rules.lookback} days.` : undefined}
        />
        {s && decision && s.months.length > 0 && (
          <details className="card p-3 text-[13px]">
            <summary className="cursor-pointer font-semibold text-teal">See month by month</summary>
            <ul className="mt-2 divide-y divide-line">
              {s.months.map((m) => (
                <li key={m.month} className="flex justify-between py-1.5">
                  <span>{monthLabel(m.month)}</span>
                  <span className="num">{inr(m.credits)}</span>
                </li>
              ))}
            </ul>
            {s.payday && <p className="mt-2 text-muted">Your money usually lands on the {ordinal(s.payday)}.</p>}
          </details>
        )}
      </section>

      {decision?.decision === "approved" && (
        <p className="animate-asc-in rounded-[12px] bg-mint px-3.5 py-3 text-[14px] font-semibold text-teal">All three passed. Let&apos;s work out your limit.</p>
      )}
      {decision?.decision === "builder" && (
        <p className="animate-asc-in rounded-[12px] bg-amber-soft px-3.5 py-3 text-[14px] text-amber-deep">Not yet, and that&apos;s fixable. We&apos;ll show you exactly what to change.</p>
      )}
      <ErrorNote error={error} />
      <Footer>
        {!decision ? (
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={check}>
            {busy ? "Checking…" : "Check my eligibility"}
          </button>
        ) : (
          <button type="button" className="btn-primary w-full" onClick={() => router.push(decision.decision === "approved" ? "/start/limit" : "/start/builder")}>
            {decision.decision === "approved" ? "See my limit" : "See what to change"}
          </button>
        )}
      </Footer>
    </div>
  );
}

// ---------- 7. Limit: offer, lower-limit slider, then the KFS ----------
export function LimitChooser({ offer, min, step }: { offer: number; min: number; step: number }) {
  const { busy, error, run, router } = useAction({ refresh: false });
  const [value, setValue] = useState(offer);
  return (
    <div className="flex flex-col gap-3">
      <section className="card p-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="l-slide" className="text-[14px] font-[650]">
            Want a lower limit?
          </label>
          <span className="text-[20px] font-[750] text-teal num">{inr(value)}</span>
        </div>
        <input
          id="l-slide"
          type="range"
          min={min}
          max={offer}
          step={step}
          value={value}
          disabled={offer <= min}
          onChange={(e) => setValue(Number(e.target.value))}
          className="mt-3 w-full accent-[#0F5C4D]"
        />
        <div className="flex justify-between text-[12px] text-muted num">
          <span>{inr(min)}</span>
          <span>{inr(offer)} (your offer)</span>
        </div>
        <p className="mt-2 text-[12px] text-muted">You can choose less than we offer, never more.</p>
      </section>
      <ErrorNote error={error} />
      <button className="btn-primary w-full" disabled={busy} onClick={() => run(() => api("onboarding/limit", { amount: value }), () => router.refresh())}>
        {busy ? "Preparing your Key Fact Statement…" : `Continue with ${inr(value)}`}
      </button>
    </div>
  );
}

export function KfsAccept({ version, children }: { version: number; children: React.ReactNode }) {
  const { busy, error, run, router } = useAction({ refresh: false });
  const [read, setRead] = useState(false);
  const [agree, setAgree] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div
        className="max-h-[52vh] overflow-y-auto rounded-[16px] border border-line bg-white p-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setRead(true);
        }}
        tabIndex={0}
        aria-label="Key Fact Statement"
      >
        {children}
      </div>
      {!read && <p className="text-center text-[12px] text-muted">Scroll to the end of the KFS to continue.</p>}
      <label className={`flex items-start gap-3 rounded-[14px] border p-3.5 text-[14px] ${read ? "border-teal bg-mint" : "border-line bg-[#F4F5F2] text-muted"}`}>
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#0F5C4D]" disabled={!read} checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        I&apos;ve read the Key Fact Statement and understand what this line costs. I agree.
      </label>
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <a href="/start/limit?change=1" className="btn-secondary flex-1">
          Change limit
        </a>
        <button className="btn-primary flex-1" disabled={!agree || busy} onClick={() => run(() => api("onboarding/kfs/accept", { version }), () => router.push("/start/ladder"))}>
          {busy ? "Saving…" : "Accept and continue"}
        </button>
      </div>
    </div>
  );
}

// ---------- 9. AutoPay + due day ----------
export function AutopayForm({ payday, suggested, offset, limit, firstName }: { payday: number | null; suggested: number | null; offset: number; limit: number; firstName: string }) {
  const { busy, error, run, router } = useAction({ refresh: false });
  const [land, setLand] = useState<number>(payday ?? 1);
  const [dueDay, setDueDay] = useState<number>(suggested ?? ((land - 1 + offset) % 31) + 1);
  const [autopayOn, setAutopayOn] = useState(true);
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Confetti />
        <span className="flex h-16 w-16 animate-asc-pop items-center justify-center rounded-full bg-teal text-white">
          <Icon name="check" size={32} strokeWidth={2.6} />
        </span>
        <h2 className="h-title">Welcome to Ascend, {firstName}.</h2>
        <p className="max-w-[300px] text-[15px] text-muted">Your credit record starts today. Spend a little, pay it back by the {ordinal(dueDay)}, repeat.</p>
        <dl className="grid w-full grid-cols-3 gap-2 text-[13px]">
          {[
            ["Limit", inr(limit)],
            ["Due", ordinal(dueDay)],
            ["AutoPay", autopayOn ? "On" : "Off"],
          ].map(([k, v]) => (
            <div key={k} className="card p-3">
              <dt className="text-muted">{k}</dt>
              <dd className="text-[16px] font-[700]">{v}</dd>
            </div>
          ))}
        </dl>
        <button className="btn-primary mt-4 w-full" onClick={() => router.push("/home")}>
          Go to Home
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h2 className="h-title">Pocket money day?</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">We set your due date {offset} days after your money lands, so it&apos;s always there in time.</p>
      </div>
      <section className="card p-4">
        <label htmlFor="a-land" className="label">
          When does your money land?
        </label>
        <select
          id="a-land"
          className="field"
          value={land}
          onChange={(e) => {
            const v = Number(e.target.value);
            setLand(v);
            setDueDay(((v - 1 + offset) % 31) + 1);
          }}
        >
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {ordinal(d)} of the month
            </option>
          ))}
        </select>
        <p className="mt-2 text-[13px] text-muted">
          {payday ? `Your statement shows money landing on the ${ordinal(payday)}. ` : ""}Money lands on the {ordinal(land)} → your bill is due on the <strong className="text-ink">{ordinal(dueDay)}</strong> of every month.
        </p>
        <details className="mt-2 text-[13px]">
          <summary className="cursor-pointer font-semibold text-teal">Pick a different due day</summary>
          <select aria-label="Due day" className="field mt-2" value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {ordinal(d)}
              </option>
            ))}
          </select>
        </details>
      </section>
      <section className="card flex items-center gap-3 p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[15px] font-[650]">
            UPI AutoPay <SandboxTag />
          </div>
          <div className="text-[13px] text-muted">{autopayOn ? "Pays your full bill on the due date. If it fails, we retry on your money day." : "You'll pay manually each month. We'll remind you."}</div>
        </div>
        <Toggle on={autopayOn} label="UPI AutoPay" onChange={setAutopayOn} />
      </section>
      <ErrorNote error={error} />
      <Footer>
        <button className="btn-primary w-full" disabled={busy} onClick={() => run(() => api("onboarding/activate", { autopayOn, dueDay }), () => setDone(true))}>
          {busy ? "Setting up…" : "Finish setup"}
        </button>
      </Footer>
    </div>
  );
}

export function RecheckButton() {
  const { busy, error, run, router } = useAction({ refresh: false });
  return (
    <>
      <ErrorNote error={error} />
      <button
        className="btn-primary w-full"
        disabled={busy}
        onClick={() =>
          run(
            () => api<{ decision: { decision: string } }>("onboarding/underwrite", {}),
            (r) => router.push(r.decision.decision === "approved" ? "/start/limit" : "/start/builder"),
          )
        }
      >
        {busy ? "Re-checking…" : "Re-check now"}
      </button>
    </>
  );
}
