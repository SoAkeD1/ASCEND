import { AppPage, pausedReason } from "@/components/AppPage";
import { PayForm } from "@/components/PayForm";
import { AllCharges } from "@/components/bits";
import { loadApp } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function PayPage({ searchParams }: { searchParams: { merchant?: string; amount?: string; category?: string } }) {
  const { st } = await loadApp();
  const { c } = st;
  const fees = { interestPct: c.interest_on_time_pct, processing: c.processing_fee, annual: c.annual_fee, late: c.late_fee, foreclosure: c.foreclosure_fee };
  return (
    <AppPage st={st} title="Pay" trust>
      <PayForm
        available={st.available}
        limit={st.line.currentLimit}
        outstanding={st.outstanding}
        dueDate={st.open?.dueDate ?? null}
        nudgePct={c.utilisation_nudge_pct}
        bigPct={c.big_spend_confirm_pct}
        interestPct={c.interest_on_time_pct}
        fees={c.processing_fee + c.annual_fee}
        paused={pausedReason(st)}
        prefill={{
          merchant: searchParams.merchant?.slice(0, 80),
          amount: searchParams.amount && /^\d{1,7}$/.test(searchParams.amount) ? searchParams.amount : undefined,
          category: searchParams.category,
        }}
      />
      <AllCharges fees={fees} />
    </AppPage>
  );
}
