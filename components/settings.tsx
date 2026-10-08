"use client";

import { useState } from "react";
import { api, ErrorNote, SignOutButton, useAction } from "./client";
import { Toggle } from "./onboarding";
import { ordinal } from "@/lib/format";

type Consent = { type: string; purpose: string; granted: boolean };
const TITLES: Record<string, string> = { kyc: "Identity (KYC)", aa: "Bank statements", bureau: "Credit bureau check", family_share: "Family View sharing" };

export function SettingsControls(props: { consents: Consent[]; autopayOn: boolean; dueDay: number; selfFrozen: boolean; grievanceDays: number }) {
  const { busy, error, run } = useAction();
  const [dueDay, setDueDay] = useState(props.dueDay);
  const save = (body: object) => run(() => api("line/settings", body));
  return (
    <div className="flex flex-col gap-3">
      <ErrorNote error={error} />
      <section className="card divide-y divide-line px-4">
        <div className="flex items-center gap-3 py-3.5">
          <span className="flex-1">
            <span className="block text-[15px] font-[650]">UPI AutoPay</span>
            <span className="text-[12px] text-muted">Pays your full bill on the due date.</span>
          </span>
          <Toggle on={props.autopayOn} label="UPI AutoPay" disabled={busy} onChange={(v) => save({ autopayOn: v })} />
        </div>
        <div className="flex items-center gap-3 py-3.5">
          <span className="flex-1">
            <span className="block text-[15px] font-[650]">Freeze my line</span>
            <span className="text-[12px] text-muted">Stops new spends until you unfreeze. Bills still need paying.</span>
          </span>
          <Toggle on={props.selfFrozen} label="Freeze my line" disabled={busy} onChange={(v) => save({ selfFrozen: v })} />
        </div>
        <div className="flex items-center gap-3 py-3.5">
          <label htmlFor="s-due" className="flex-1">
            <span className="block text-[15px] font-[650]">Due day</span>
            <span className="text-[12px] text-muted">Applies from your next cycle.</span>
          </label>
          <select id="s-due" className="field w-24 py-2" value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {ordinal(d)}
              </option>
            ))}
          </select>
          {dueDay !== props.dueDay && (
            <button className="btn-primary min-h-[40px] px-3 text-[13px]" disabled={busy} onClick={() => save({ dueDay })}>
              Save
            </button>
          )}
        </div>
      </section>

      <section className="card p-4">
        <h3 className="text-[15px] font-[650]">Your consents</h3>
        <p className="mt-1 text-[12px] text-muted">Withdraw any time. Withdrawing doesn&apos;t cancel your line, but we can&apos;t re-check your limit without it.</p>
        <ul className="mt-2 divide-y divide-line">
          {props.consents.map((c) => (
            <li key={c.type} className="flex items-start gap-3 py-3">
              <span className="flex-1">
                <span className="block text-[14px] font-[650]">{TITLES[c.type]}</span>
                <span className="text-[12px] leading-snug text-muted">{c.purpose}</span>
              </span>
              <Toggle on={c.granted} label={TITLES[c.type]} disabled={busy || c.type === "family_share"} onChange={(v) => run(() => api("consents", { type: c.type, granted: v }))} />
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[12px] text-muted">Family View sharing turns on and off with your share links on the Family page.</p>
      </section>
      <GrievanceForm days={props.grievanceDays} />
      <DeleteData />
      <SignOutButton />
    </div>
  );
}

function GrievanceForm({ days }: { days: number }) {
  const { busy, error, run } = useAction();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <section className="card p-4">
      <h3 className="text-[15px] font-[650]">Raise a complaint</h3>
      {sent ? (
        <p className="mt-2 text-[14px] text-teal">Received. You&apos;ll hear back within {days} days; if not, you can escalate to the RBI.</p>
      ) : (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api("grievances", { subject, body }), () => setSent(true));
          }}
        >
          <input aria-label="Subject" placeholder="Subject" className="field" value={subject} onChange={(e) => setSubject(e.target.value)} minLength={3} required />
          <textarea aria-label="What happened" placeholder="What happened?" className="field min-h-[96px]" value={body} onChange={(e) => setBody(e.target.value)} minLength={10} required />
          <ErrorNote error={error} />
          <button className="btn-secondary" disabled={busy}>
            Send to the grievance officer
          </button>
        </form>
      )}
    </section>
  );
}

function DeleteData() {
  const { busy, error, run, router } = useAction({ refresh: false });
  const [confirm, setConfirm] = useState("");
  return (
    <section className="card border-amber-line p-4">
      <h3 className="text-[15px] font-[650] text-amber">Delete my data</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Wipes your name, contact details, date of birth, college, KYC digits and bank statement data, and revokes every consent and share link. Loan records stay, with no name attached,
        because the lender must keep them. Only possible when nothing is owed.
      </p>
      <input aria-label='Type DELETE to confirm' placeholder="Type DELETE to confirm" className="field mt-2" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <ErrorNote error={error} />
      <button
        className="btn-amber mt-2 w-full"
        disabled={busy || confirm !== "DELETE"}
        onClick={() =>
          run(
            async () => {
              await api("account/delete", { confirm: "DELETE" });
              await api("auth/signout", {});
            },
            () => router.push("/"),
          )
        }
      >
        Delete my data
      </button>
    </section>
  );
}
