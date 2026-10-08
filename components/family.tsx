"use client";

import { useState } from "react";
import { api, ErrorNote, useAction } from "./client";
import { Toggle } from "./onboarding";
import { Icon } from "./Icon";

type Link = { id: string; token: string; showAttentionFlag: boolean; createdAt: string; revokedAt: string | null; lastViewedAt: string | null };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Not yet");

export function FamilyControls({ links, origin }: { links: Link[]; origin: string }) {
  const { busy, error, run } = useAction();
  const [attention, setAttention] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const active = links.filter((l) => !l.revokedAt);
  const revoked = links.filter((l) => l.revokedAt);
  return (
    <div className="flex flex-col gap-3">
      <section className="card p-4">
        <h3 className="text-[15px] font-[650]">Create a share link</h3>
        <p className="mt-1 text-[13px] text-muted">Anyone with the link sees only what&apos;s listed above. You can switch it off any time, instantly.</p>
        <label className="mt-3 flex items-center gap-3 text-[14px]">
          <span className="flex-1">
            Show &quot;Payment status: needs attention&quot; if I&apos;m ever late
            <span className="block text-[12px] text-muted">Off: a late payment is simply not shown.</span>
          </span>
          <Toggle on={attention} label="Show needs-attention flag" onChange={setAttention} />
        </label>
        <ErrorNote error={error} />
        <button className="btn-primary mt-3 w-full" disabled={busy} onClick={() => run(() => api("family", { showAttentionFlag: attention }))}>
          <Icon name="link" size={18} /> Create link
        </button>
      </section>

      {active.map((l) => {
        const url = `${origin}/family/${l.token}`;
        return (
          <section key={l.id} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-mint px-2.5 py-1 text-[12px] font-bold text-teal">Active</span>
              <span className="text-[12px] text-muted">Last viewed: {when(l.lastViewedAt)}</span>
            </div>
            <p className="mt-2 break-all rounded-[10px] bg-[#F4F5F2] p-2.5 text-[12px] text-muted">{url}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                className="btn-secondary min-h-[42px] text-[14px]"
                onClick={() => {
                  navigator.clipboard?.writeText(url);
                  setCopied(l.id);
                }}
              >
                {copied === l.id ? "Copied" : "Copy link"}
              </button>
              <a className="btn-secondary min-h-[42px] text-[14px]" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`My Ascend progress (read-only, no amounts): ${url}`)}`}>
                Share on WhatsApp
              </a>
            </div>
            <label className="mt-3 flex items-center gap-3 text-[13px]">
              <span className="flex-1">Needs-attention flag</span>
              <Toggle on={l.showAttentionFlag} label="Needs-attention flag" disabled={busy} onChange={(v) => run(() => api(`family/${l.id}`, { showAttentionFlag: v }, "PATCH"))} />
            </label>
            <button className="btn-amber mt-3 w-full min-h-[42px] text-[14px]" disabled={busy} onClick={() => run(() => api(`family/${l.id}`, undefined, "DELETE"))}>
              Revoke now
            </button>
          </section>
        );
      })}
      {revoked.length > 0 && <p className="text-center text-[12px] text-muted">{revoked.length} revoked link{revoked.length === 1 ? "" : "s"}; they no longer open.</p>}
    </div>
  );
}
