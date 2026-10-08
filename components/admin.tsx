"use client";

import { useState } from "react";
import { api, ErrorNote, useAction } from "./client";

export function RecomputeBrakes() {
  const { busy, error, run } = useAction();
  return (
    <div className="flex items-center gap-2">
      <ErrorNote error={error} />
      <button className="btn-secondary min-h-[36px] px-3 text-[13px]" disabled={busy} onClick={() => run(() => api("admin/brakes", {}))}>
        {busy ? "Recomputing…" : "Recompute brakes now"}
      </button>
    </div>
  );
}

type Row = { key: string; value: unknown; version: number; updatedAt: string; updatedBy: string | null };

/** One row per rule. Numbers edit as numbers, everything else as JSON. The server validates every save. */
export function ConfigEditor({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState("");
  const shown = rows.filter((r) => r.key.includes(filter.toLowerCase()));
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-[700]">Business rules (config table)</h2>
          <p className="text-[12px] text-muted">Every rule the engines use. Saving bumps the version and writes the audit log. Takes effect immediately.</p>
        </div>
        <input aria-label="Filter rules" placeholder="Filter…" className="field w-48 py-2" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {shown.map((r) => (
          <ConfigRow key={r.key} row={r} />
        ))}
      </div>
    </section>
  );
}

function ConfigRow({ row }: { row: Row }) {
  const { busy, error, run } = useAction();
  const isNum = typeof row.value === "number";
  const isStr = typeof row.value === "string";
  const initial = isNum ? String(row.value) : isStr ? (row.value as string) : JSON.stringify(row.value);
  const [text, setText] = useState(initial);
  const dirty = text !== initial;
  const save = () =>
    run(() => {
      let value: unknown;
      if (isNum) value = Number(text);
      else if (isStr) value = text;
      else {
        try {
          value = JSON.parse(text);
        } catch {
          throw new Error("That isn't valid JSON.");
        }
      }
      return api("admin/config", { key: row.key, value }, "PUT");
    });
  return (
    <div className={`rounded-[12px] border p-3 ${dirty ? "border-teal" : "border-line"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`cfg-${row.key}`} className="font-mono text-[13px] font-semibold">
          {row.key}
        </label>
        <span className="text-[11px] text-muted">
          v{row.version} · {row.updatedBy ?? "—"}
        </span>
      </div>
      <div className="mt-1.5 flex gap-2">
        {isNum || isStr ? (
          <input id={`cfg-${row.key}`} className="field py-1.5 font-mono text-[14px]" value={text} inputMode={isNum ? "decimal" : undefined} onChange={(e) => setText(e.target.value)} />
        ) : (
          <textarea id={`cfg-${row.key}`} className="field min-h-[38px] py-1.5 font-mono text-[12px]" rows={text.length > 60 ? 3 : 1} value={text} onChange={(e) => setText(e.target.value)} />
        )}
        <button className="btn-primary min-h-[38px] px-3 text-[13px]" disabled={!dirty || busy} onClick={save}>
          Save
        </button>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

export function CreateTestUser() {
  const { busy, error, run } = useAction();
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [inflows, setInflows] = useState("");
  const [bounce, setBounce] = useState(false);
  const [overdue, setOverdue] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const parsed = inflows
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  const valid = fullName.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(dob) && parsed.every((n) => Number.isInteger(n) && n >= 0);
  return (
    <section className="card p-5">
      <h2 className="text-[16px] font-[700]">Create test user</h2>
      <p className="text-[12px] text-muted">Nothing is pre-filled. The user goes through the real engines; the history length is the number of monthly amounts you type.</p>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              api<{ userId: string; decision: string | null }>("admin/demo/user", {
                fullName,
                dob,
                monthlyInflows: parsed,
                bounce,
                overdueAmount: overdue ? Number(overdue) : null,
              }),
            (r) => setResult(`Created. Decision: ${r.decision ?? "none yet (no inflow entered)"}.`),
          );
        }}
      >
        <div>
          <label htmlFor="tu-name" className="label">
            Full name
          </label>
          <input id="tu-name" className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="tu-dob" className="label">
            Date of birth
          </label>
          <input id="tu-dob" type="date" className="field" value={dob} onChange={(e) => setDob(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="tu-in" className="label">
            Monthly inflows, oldest first (₹, comma-separated)
          </label>
          <input id="tu-in" className="field font-mono" value={inflows} onChange={(e) => setInflows(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" className="h-4 w-4 accent-[#0F5C4D]" checked={bounce} onChange={(e) => setBounce(e.target.checked)} />
          Add a bounce yesterday
        </label>
        <div>
          <label htmlFor="tu-od" className="label">
            Overdue loan elsewhere (₹, blank = none)
          </label>
          <input id="tu-od" className="field" inputMode="numeric" value={overdue} onChange={(e) => setOverdue(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="sm:col-span-2">
          <ErrorNote error={error} />
          {result && <p className="mb-2 text-[13px] font-semibold text-teal">{result}</p>}
          <button className="btn-primary" disabled={busy || !valid}>
            Create through the real pipeline
          </button>
        </div>
      </form>
    </section>
  );
}

type U = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  cohort: string;
  isDemo: boolean;
  clockOffsetDays: number;
  line: { status: string; currentLimit: number; autopayOn: boolean; forceAutopayFail: boolean } | null;
};

export function UserTools({ users, demo }: { users: U[]; demo: boolean }) {
  const { busy, error, run, router } = useAction();
  const [msg, setMsg] = useState<string | null>(null);
  const [dpd, setDpd] = useState<Record<string, string>>({});
  const travel = (userId: string, body: object) =>
    run(() => api<{ from: string; to: string; daysProcessed: number }>("admin/demo/time", { userId, ...body }), (r) => setMsg(`Moved ${r.from} → ${r.to}; replayed ${r.daysProcessed} days.`));
  return (
    <section className="card overflow-x-auto p-5">
      <h2 className="text-[16px] font-[700]">Users {demo ? "and time travel" : ""}</h2>
      <ErrorNote error={error} />
      {msg && <p className="mt-2 text-[13px] font-semibold text-teal">{msg}</p>}
      <table className="mt-3 w-full min-w-[980px] text-left text-[13px]">
        <thead className="text-[12px] text-muted">
          <tr className="border-b border-line">
            <th className="py-2">User</th>
            <th>Cohort</th>
            <th>Line</th>
            <th>Clock</th>
            {demo && <th>Demo tools</th>}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-line align-top">
              <td className="py-2">
                <span className="font-semibold">{u.name ?? "(no name yet)"}</span>
                {u.isDemo && <span className="ml-1.5 rounded bg-[#F1F3EF] px-1.5 text-[11px]">demo</span>}
                <span className="block text-[12px] text-muted">
                  {u.email ?? "—"} · {u.role}
                </span>
              </td>
              <td>{u.cohort}</td>
              <td>{u.line ? `${u.line.status} · ₹${u.line.currentLimit}${u.line.autopayOn ? " · AutoPay" : ""}${u.line.forceAutopayFail ? " · fail forced" : ""}` : "—"}</td>
              <td>{u.clockOffsetDays ? `+${u.clockOffsetDays} days` : "real"}</td>
              {demo && (
                <td className="py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {u.line && u.line.status !== "pending" && (
                      <>
                        <button className="btn-secondary min-h-[30px] px-2 text-[12px]" disabled={busy} onClick={() => travel(u.id, { days: 1 })}>
                          +1 day
                        </button>
                        <button className="btn-secondary min-h-[30px] px-2 text-[12px]" disabled={busy} onClick={() => travel(u.id, { cycles: 1 })}>
                          +1 cycle
                        </button>
                        <button className="btn-secondary min-h-[30px] px-2 text-[12px]" disabled={busy} onClick={() => travel(u.id, { dueDate: true })}>
                          Due date
                        </button>
                        <span className="flex items-center gap-1">
                          <input
                            aria-label="Days past due"
                            className="field w-16 py-1 text-[12px]"
                            inputMode="numeric"
                            placeholder="DPD"
                            value={dpd[u.id] ?? ""}
                            onChange={(e) => setDpd({ ...dpd, [u.id]: e.target.value.replace(/\D/g, "") })}
                          />
                          <button className="btn-secondary min-h-[30px] px-2 text-[12px]" disabled={busy || !dpd[u.id]} onClick={() => travel(u.id, { dpd: Number(dpd[u.id]) })}>
                            Jump
                          </button>
                        </span>
                        <button
                          className="btn-secondary min-h-[30px] px-2 text-[12px]"
                          disabled={busy}
                          onClick={() => run(() => api("admin/demo/autopay-fail", { userId: u.id, on: !u.line!.forceAutopayFail }))}
                        >
                          {u.line.forceAutopayFail ? "Stop forcing fail" : "Force AutoPay fail"}
                        </button>
                        <button className="btn-secondary min-h-[30px] px-2 text-[12px]" disabled={busy} onClick={() => run(() => api("admin/demo/mark-paid", { userId: u.id }))}>
                          Mark paid
                        </button>
                      </>
                    )}
                    {u.isDemo && (
                      <button
                        className="btn-primary min-h-[30px] px-2 text-[12px]"
                        disabled={busy}
                        onClick={() => run(() => api<{ next: string }>("admin/demo/impersonate", { userId: u.id }), (r) => router.push(r.next))}
                      >
                        Open as user
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function CohortTools({ cohorts }: { cohorts: string[] }) {
  const { busy, error, run } = useAction();
  const [cohort, setCohort] = useState(cohorts[0] ?? "");
  const [pts, setPts] = useState("");
  const [sure, setSure] = useState(false);
  return (
    <section className="card p-5">
      <h2 className="text-[16px] font-[700]">Cohort tools</h2>
      <p className="text-[12px] text-muted">Inject extra DPD into a cohort to show the risk brake engaging. Set it back to 0 to release.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="ct-c" className="label">
            Cohort
          </label>
          <input id="ct-c" className="field w-32 py-2" placeholder="YYYY-MM" value={cohort} onChange={(e) => setCohort(e.target.value)} list="cohort-list" />
          <datalist id="cohort-list">
            {cohorts.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="ct-p" className="label">
            Extra DPD points (%)
          </label>
          <input id="ct-p" className="field w-28 py-2" inputMode="decimal" value={pts} onChange={(e) => setPts(e.target.value)} />
        </div>
        <button className="btn-primary min-h-[42px]" disabled={busy || !/^\d{4}-\d{2}$/.test(cohort) || pts === ""} onClick={() => run(() => api("admin/demo/inject-dpd", { cohort, pctPoints: Number(pts) }))}>
          Apply
        </button>
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-[14px] font-[650] text-amber">Reset demo data</h3>
        <p className="text-[12px] text-muted">Deletes only users made with &quot;Create test user&quot;, and clears injected DPD.</p>
        {!sure ? (
          <button className="btn-secondary mt-2 min-h-[38px] text-[13px]" onClick={() => setSure(true)}>
            Reset…
          </button>
        ) : (
          <button className="btn-amber mt-2 min-h-[38px] text-[13px]" disabled={busy} onClick={() => run(() => api("admin/demo/reset", {}), () => setSure(false))}>
            Yes, delete demo users
          </button>
        )}
      </div>
      <ErrorNote error={error} />
    </section>
  );
}
