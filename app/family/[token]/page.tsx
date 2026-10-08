import Link from "next/link";
import { MobileFrame } from "@/components/Frame";
import { AppBar } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { withActor, SYSTEM } from "@/lib/db/actor";
import { familyView } from "@/lib/services/family";

export const dynamic = "force-dynamic";
export const metadata = { title: "Family View · Ascend", robots: { index: false } };

/** Public, read-only, field-scoped. It can only render what familyView returns, which has no amounts. */
export default async function ParentViewPage({ params }: { params: { token: string } }) {
  const v = /^[A-Za-z0-9_-]{20,64}$/.test(params.token) ? await withActor(SYSTEM, (tx) => familyView(tx, params.token)) : null;
  return (
    <MobileFrame>
      <AppBar title="Family View" mode="parent" />
      <main className="flex flex-1 animate-asc-in flex-col gap-3.5 p-4">
        {!v ? (
          <section className="card p-5 text-center">
            <h2 className="text-[20px] font-[750]">This link isn&apos;t active</h2>
            <p className="mt-2 text-[14px] text-muted">It may have been switched off by the student who shared it. That&apos;s their choice to make.</p>
          </section>
        ) : (
          <>
            <div>
              <p className="text-[13px] text-muted">Shared with you by</p>
              <h2 className="text-[28px] font-[780] tracking-[-0.035em]">{v.firstName}</h2>
            </div>
            <section className={`rounded-[18px] p-4 ${v.paymentStatus === "needs_attention" ? "bg-amber-soft" : "bg-mint"}`}>
              <p className="text-[13px] font-semibold text-muted">Payment status</p>
              <p className={`text-[22px] font-[780] ${v.paymentStatus === "needs_attention" ? "text-amber" : "text-teal"}`}>
                {v.paymentStatus === "on_track" ? "On track" : v.paymentStatus === "needs_attention" ? "Needs attention" : "Not shared"}
              </p>
            </section>
            <div className="grid grid-cols-2 gap-2.5">
              <section className="card p-4">
                <p className="text-[12px] text-muted">On-time streak</p>
                <p className="text-[28px] font-[780] num">{v.streak}</p>
                <p className="text-[12px] text-muted">cycles in a row</p>
              </section>
              <section className="card p-4">
                <p className="text-[12px] text-muted">Ladder</p>
                <p className="text-[28px] font-[780] num">
                  {v.ladder.reached}/{v.ladder.total}
                </p>
                <p className="text-[12px] text-muted">{v.ladder.cyclesToNext !== null ? `${v.ladder.cyclesToNext} to the next step` : "top reached"}</p>
              </section>
            </div>
            <section className="card p-4">
              <p className="text-[12px] text-muted">Credit score journey</p>
              <p className="text-[18px] font-[700]">
                {v.scoreStage === "first_score" ? "Enough history for a first score" : v.scoreStage === "building" ? `Building · ${v.cyclesToFirstScore} cycles to a first score` : "Just started"}
              </p>
            </section>
            <p className="flex items-start gap-2 rounded-[12px] bg-[#F4F5F2] p-3 text-[12px] text-muted">
              <Icon name="eye" size={16} className="mt-px flex-none" />
              Read-only. Spending, shops and amounts are never shown here, by design.
            </p>
          </>
        )}
        <Link href="/parents" className="btn-secondary mt-auto">
          What is Ascend? (English / हिंदी)
        </Link>
      </main>
    </MobileFrame>
  );
}
