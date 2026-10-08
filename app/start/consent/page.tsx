import { OnboardFrame } from "@/components/Frame";
import { ConsentForm } from "@/components/onboarding";
import { loadStep } from "@/lib/page";
import { getConsents } from "@/lib/services/onboarding";

export const dynamic = "force-dynamic";

export default async function ConsentPage() {
  const { data } = await loadStep(["consent", "bureau"], (tx, userId) => getConsents(tx, userId));
  return (
    <OnboardFrame title="Your consent" step={4} back="/start/enrolment">
      <ConsentForm initial={data.map(({ type, purpose, granted }) => ({ type, purpose, granted }))} />
    </OnboardFrame>
  );
}
