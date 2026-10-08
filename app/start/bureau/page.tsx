import { OnboardFrame } from "@/components/Frame";
import { BureauForm } from "@/components/onboarding";
import { loadStep } from "@/lib/page";
import { BUREAU_SANDBOX_LABEL } from "@/lib/providers/sandbox";

export const dynamic = "force-dynamic";

export default async function BureauPage() {
  await loadStep(["bureau"], async () => null);
  return (
    <OnboardFrame title="Credit check" step={5} back="/start/consent">
      <BureauForm sourceLabel={BUREAU_SANDBOX_LABEL} />
    </OnboardFrame>
  );
}
