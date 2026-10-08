import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Icon";
import { SignOutButton } from "./client";

/** Desktop layout for the Lender and Admin pages. */
export function StaffShell({ title, role, children }: { title: string; role: "lender" | "admin"; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Logo />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-teal">Ascend · {role}</p>
            <h1 className="text-[18px] font-[750] tracking-[-0.02em]">{title}</h1>
          </div>
          <nav className="ml-auto flex items-center gap-4 text-[14px] font-semibold">
            <Link href="/lender" className="text-teal">
              Lender
            </Link>
            {role === "admin" && (
              <Link href="/admin" className="text-teal">
                Admin
              </Link>
            )}
            <Link href="/home" className="text-muted">
              Student app
            </Link>
            <SignOutButton className="btn-secondary min-h-[36px] px-3 text-[13px]" />
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6">{children}</main>
    </div>
  );
}

export function Stat({ label, value, sub, tone = "ink" }: { label: string; value: string; sub?: string; tone?: "ink" | "teal" | "amber" }) {
  return (
    <section className="card p-4">
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      <p className={`mt-1 text-[28px] font-[780] tracking-[-0.03em] num ${tone === "teal" ? "text-teal" : tone === "amber" ? "text-amber" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
    </section>
  );
}
