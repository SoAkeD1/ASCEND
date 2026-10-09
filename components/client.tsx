"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";

/** POST/PUT/PATCH/DELETE to /api/... and return the JSON, or throw the server's message. */
export async function api<T = unknown>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && typeof data === "object" && "error" in data && data.error)) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

/**
 * Runs an action with a busy flag and a friendly error, then (by default) refreshes the page's
 * server data. Onboarding forms pass refresh:false because they move to the next step themselves.
 */
export function useAction({ refresh = true }: { refresh?: boolean } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>, after?: (r: T) => void | Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (after) await after(r);
      if (refresh) router.refresh();
      return r;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run, router };
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="animate-asc-in rounded-[12px] border border-amber-line bg-amber-soft px-3.5 py-2.5 text-[13px] leading-snug text-amber-deep">
      {error}
    </p>
  );
}

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/pay", label: "Pay", icon: "scan" },
  { href: "/statement", label: "Statement", icon: "doc" },
  { href: "/score", label: "Score", icon: "gauge" },
  { href: "/rewards", label: "Rewards", icon: "gift" },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="sticky bottom-0 z-20 grid h-[72px] grid-cols-5 border-t border-[rgba(20,26,34,0.06)] bg-white/95 px-1 pb-2.5 pt-1.5 shadow-[0_-8px_24px_-18px_rgba(20,26,34,0.25)] backdrop-blur-[14px]">
      {TABS.map((t) => {
        const on = path === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`flex min-h-[44px] flex-col items-center justify-center gap-[3px] text-[11px] ${on ? "font-bold text-teal" : "font-medium text-[#6B7482]"}`}>
            <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${on ? "bg-teal text-white" : "text-[#6B7482]"}`}>
              <Icon name={t.icon} size={21} />
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MomentCard({ tip, why, label, tone = "teal", id }: { tip: string; why: string; label: string; tone?: "teal" | "amber"; id?: string }) {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const amber = tone === "amber";
  if (gone) return null;
  return (
    <section className={`flex animate-asc-in flex-col gap-2 rounded-[18px] border px-4 py-3.5 shadow-card ${amber ? "border-[#F3D3BF] bg-[#FFF8F3]" : "border-[#D6EAE2] bg-white"}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${amber ? "bg-amber-soft text-amber" : "bg-mint text-teal"}`}>
          <Icon name="bulb" size={16} />
        </span>
        <span className={`flex-1 text-[11px] font-bold uppercase tracking-[0.07em] ${amber ? "text-amber" : "text-teal"}`}>{label}</span>
        {id && (
          <button
            type="button"
            aria-label="Dismiss"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-black/5"
            onClick={() => {
              setGone(true);
              api(`moments/${id}/seen`).catch(() => {});
            }}
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
      <p className="text-[15px] font-semibold leading-snug">{tip}</p>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`inline-flex min-h-8 items-center self-start rounded-full border bg-white px-3 text-[13px] font-semibold ${amber ? "border-[#F3D3BF] text-amber" : "border-[#D6EAE2] text-teal"}`}
      >
        {open ? "Got it" : "Why?"}
      </button>
      {open && <p className="animate-asc-in text-[13px] leading-relaxed text-muted">{why}</p>}
    </section>
  );
}

/**
 * Bottom sheet. Rendered into document.body (a portal): the page's slide-in animation uses a
 * transform, which would otherwise trap this fixed overlay inside the page and under the tab bar.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(20,26,34,0.42)]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[430px] animate-asc-sheet rounded-t-[24px] bg-white p-5 pb-8 shadow-[0_-20px_40px_-20px_rgba(20,26,34,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#DCE1DB]" />
        <h2 className="text-[20px] font-[750] tracking-[-0.02em]">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function SignOutButton({ className = "btn-secondary w-full" }: { className?: string }) {
  const { run, busy, router } = useAction();
  return (
    <button type="button" disabled={busy} className={className} onClick={() => run(() => api<{ next: string }>("auth/signout"), (r) => router.push(r.next))}>
      Sign out
    </button>
  );
}

export function Confetti() {
  const colors = ["#0F5C4D", "#9BE0C9", "#C2410C", "#F2A57A", "#2E8B74"];
  // Draw only after the page has loaded in the browser, so server and browser output match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 h-2.5 w-1.5 animate-asc-fall rounded-sm"
          style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 7) * 0.08}s` }}
        />
      ))}
    </div>,
    document.body,
  );
}
