import { OnboardFrame } from "@/components/Frame";
import { CashFlowForm } from "@/components/onboarding";
import { loadStep } from "@/lib/page";
import { getConfig } from "@/lib/config";
import { todayFor } from "@/lib/clock";
import { inflowSummary } from "@/lib/services/onboarding";

export const dynamic = "force-dynamic";

export default async function CashFlowPage() {
  const { data } = await loadStep(["cashflow", "builder", "limit"], async (tx, userId) => {
    const s = await inflowSummary(tx, userId);
    return { c: await getConfig(tx), today: await todayFor(tx, userId), s: s.historyMonths > 0 ? s : null };
  });
  return (
    <OnboardFrame title="Cash flow" step={6} back="/start/bureau">
      <CashFlowForm
        today={data.today}
        initial={data.s}
        rules={{ minInflow: data.c.min_inflow, minHistory: data.c.min_history_months, lookback: data.c.bounce_lookback_days }}
      />
    </OnboardFrame>
  );
}
