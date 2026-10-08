import { OnboardFrame } from "@/components/Frame";
import { SignOutButton } from "@/components/client";
import { loadStep } from "@/lib/page";
import { latestDecision } from "@/lib/services/common";
import { getConfig } from "@/lib/config";
import { longDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgeBlockPage() {
  const { data } = await loadStep(["age_block"], async (tx, userId) => ({ d: await latestDecision(tx, userId), c: await getConfig(tx) }));
  return (
    <OnboardFrame title="Not yet">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mint text-[26px] font-[780] text-teal">{data.c.min_age}+</span>
        <h2 className="h-title">Ascend is for {data.c.min_age}+.</h2>
        {data.d?.recheckAt && (
          <p className="text-[20px] font-[700] text-teal">
            Come back on {longDate(data.d.recheckAt)}.
          </p>
        )}
        <p className="max-w-[320px] text-[15px] leading-relaxed text-muted">
          Credit is a grown-up product, so the law and we both wait until you&apos;re {data.c.min_age}. We kept only your come-back date, nothing else you typed.
        </p>
        <p className="text-[13px] text-muted">Nothing else to sign up for, and nothing to buy. See you on your birthday.</p>
      </div>
      <SignOutButton />
    </OnboardFrame>
  );
}
