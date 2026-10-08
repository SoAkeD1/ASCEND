import { eq } from "drizzle-orm";
import { OnboardFrame } from "@/components/Frame";
import { KycForm } from "@/components/onboarding";
import { loadStep } from "@/lib/page";
import { kycRecords } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function KycPage() {
  const { data } = await loadStep(["kyc", "enrolment"], async (tx, userId) => {
    const [k] = await tx.select().from(kycRecords).where(eq(kycRecords.userId, userId));
    return k ? { panLast4: k.panLast4, aadhaarLast4: k.aadhaarLast4 } : null;
  });
  return (
    <OnboardFrame title="Verify your identity" step={2} back="/start/profile">
      <KycForm done={data} />
    </OnboardFrame>
  );
}
