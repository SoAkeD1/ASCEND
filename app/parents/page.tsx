import Link from "next/link";
import { MobileFrame } from "@/components/Frame";
import { AppBar, TrustStrip } from "@/components/bits";
import { withActor, SYSTEM } from "@/lib/db/actor";
import { getConfig } from "@/lib/config";
import type { Config } from "@/lib/config/schema";
import { inr } from "@/lib/format";
import en from "@/i18n/parents.en.json";
import hi from "@/i18n/parents.hi.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "For parents · Ascend" };

/** Fill {placeholders} in the i18n text with live config values. */
function fill(text: string, c: Config) {
  const v: Record<string, string> = {
    limit_pct: String(c.limit_pct),
    limit_min: inr(c.limit_min),
    limit_max: inr(c.limit_max),
    interest_pct: String(c.interest_on_time_pct),
    processing_fee: inr(c.processing_fee),
    annual_fee: inr(c.annual_fee),
    late_fee: inr(c.late_fee),
    grace_days: String(c.grace_days),
    hardship_months: c.hardship_months_options.join("/"),
    partner: c.partner_bank_name,
    grievance_days: String(c.grievance_escalation_days),
    bureau_report_dpd: String(c.bureau_report_dpd),
  };
  return text.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`);
}

export default async function ParentsPage({ searchParams }: { searchParams: { lang?: string } }) {
  const c = await withActor(SYSTEM, (tx) => getConfig(tx));
  const t = searchParams.lang === "hi" ? hi : en;
  return (
    <MobileFrame>
      <AppBar title={t.kicker} mode="parent" back="/" />
      <main lang={searchParams.lang === "hi" ? "hi" : "en"} className="flex flex-1 animate-asc-in flex-col gap-3.5 p-4">
        <div role="tablist" aria-label="Language" className="grid grid-cols-2 gap-1 rounded-[14px] bg-[#EEF1EC] p-1 text-[14px] font-semibold">
          <Link href="/parents" role="tab" aria-selected={t === en} className={`flex min-h-[40px] items-center justify-center rounded-[10px] ${t === en ? "bg-white text-teal shadow-card" : "text-muted"}`}>
            English
          </Link>
          <Link href="/parents?lang=hi" role="tab" aria-selected={t === hi} className={`flex min-h-[40px] items-center justify-center rounded-[10px] ${t === hi ? "bg-white text-teal shadow-card" : "text-muted"}`}>
            हिंदी
          </Link>
        </div>
        <div>
          <p className="eyebrow">{t.kicker}</p>
          <h2 className="h-title mt-1">{t.title}</h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{t.sub}</p>
        </div>
        {t.faq.map((f, i) => (
          <details key={i} className="card group p-4" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[16px] font-[650]">
              {f.q}
              <span className="text-[20px] text-teal group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{fill(f.a, c)}</p>
          </details>
        ))}
        <p className="text-center text-[13px] text-muted">{t.foot}</p>
        <TrustStrip partner={c.partner_bank_name} interestPct={c.interest_on_time_pct} lateFee={c.late_fee} />
      </main>
    </MobileFrame>
  );
}
