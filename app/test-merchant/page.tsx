import { desc } from "drizzle-orm";
import QRCode from "qrcode";
import { MobileFrame } from "@/components/Frame";
import { AppBar, SandboxTag } from "@/components/bits";
import { TestMerchantForm } from "@/components/testMerchant";
import { withActor, SYSTEM } from "@/lib/db/actor";
import { testMerchants } from "@/lib/db/schema";
import { siteOrigin } from "@/lib/origin";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test merchant · Ascend sandbox" };

/**
 * UPI sandbox payee. Anyone can create a payee (and optional amount). Its QR encodes a link to our
 * own Pay screen with the merchant prefilled: scan it with a phone camera to "pay" in the sandbox.
 */
export default async function TestMerchantPage() {
  const rows = await withActor(SYSTEM, (tx) => tx.select().from(testMerchants).orderBy(desc(testMerchants.createdAt)).limit(6));
  const origin = siteOrigin();
  const withQr = await Promise.all(
    rows.map(async (m) => {
      const url = `${origin}/pay?${new URLSearchParams({ merchant: m.name, category: m.category, ...(m.amount ? { amount: String(m.amount) } : {}) })}`;
      return { ...m, url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#141A22", light: "#FFFFFF" } }) };
    }),
  );
  return (
    <MobileFrame>
      <AppBar title="Test merchant" mode="onboard" back="/" />
      <main className="flex flex-1 flex-col gap-3.5 p-4">
        <SandboxTag />
        <p className="text-[14px] leading-relaxed text-muted">Make a pretend shop, then scan its QR with your phone (or tap it) to pay it from your Ascend line. No real money moves.</p>
        <TestMerchantForm />
        {withQr.map((m) => (
          <section key={m.id} className="card flex items-center gap-4 p-4">
            <a href={m.url} aria-label={`Pay ${m.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.qr} alt={`QR code to pay ${m.name}`} width={110} height={110} className="rounded-[10px]" />
            </a>
            <div className="min-w-0">
              <p className="truncate text-[16px] font-[700]">{m.name}</p>
              <p className="text-[13px] text-muted">
                {m.category}
                {m.amount ? ` · ${inr(m.amount)}` : " · any amount"}
              </p>
              <a href={m.url} className="btn-link">
                Open in Pay
              </a>
            </div>
          </section>
        ))}
      </main>
    </MobileFrame>
  );
}
