import { OnboardFrame } from "@/components/Frame";
import { EnrolmentForm } from "@/components/onboarding";
import { loadStep } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function EnrolmentPage() {
  await loadStep(["enrolment"], async () => null);
  return (
    <OnboardFrame title="Your college" step={3} back="/start/kyc">
      <EnrolmentForm />
    </OnboardFrame>
  );
}
