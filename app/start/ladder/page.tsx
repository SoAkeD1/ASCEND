import Link from "next/link";
import { OnboardFrame } from "@/components/Frame";
import { loadStep } from "@/lib/page";
import { getConfig } from "@/lib/config";
import { getLine } from "@/lib/services/common";
import { ladderPreview } from "@/lib/engine/ladder";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LadderPreviewPage() {
  const { data } = await loadStep(["ladder"], async (tx, userId) => ({ c: await getConfig(tx), line: await getLine(tx, userId) }));
  const { c, line } = data;
  if (!line) return null;
  const rungs = ladderPreview(line.chosenLimit, c);
  return (
    <OnboardFrame title="Your ladder" step={8}>
      <div>
        <h2 className="h-title">Your limit grows when you pay on time, not when you ask.</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">Here&apos;s the whole path, worked out from your own limit. No hidden steps, no applications.</p>
      </div>
      <ol className="relative flex flex-col gap-3 pl-1">
        <li className="card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-teal text-[14px] font-bold text-white">0</span>
          <div>
            <div className="text-[15px] font-[650]">Today: {inr(line.chosenLimit)}</div>
            <div className="text-[13px] text-muted">Your starting limit</div>
          </div>
        </li>
        {rungs.map((r) => (
          <li key={r.cycles} className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full border-2 border-teal text-[14px] font-bold text-teal">{r.cycles}</span>
            <div>
              <div className="text-[15px] font-[650]">
                After {r.cycles} on-time cycles in a row: {r.graduate ? "graduate to a credit card offer" : inr(r.limit!)}
              </div>
              <div className="text-[13px] text-muted">
                {r.graduate ? `${c.partner_bank_name} offers you a card. Your record comes with you.` : `Up to ${inr(c.ladder_max)} at most. Paused if your income drops or a payment is missed.`}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="rounded-[12px] bg-mint px-3.5 py-3 text-[13px] leading-relaxed text-teal">
        Miss a payment and the count starts again. There&apos;s no fee for that, and no one else is told.
      </p>
      <div className="mt-auto">
        <Link href="/start/autopay" className="btn-primary w-full">
          Sounds good
        </Link>
      </div>
    </OnboardFrame>
  );
}
