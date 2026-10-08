import { OnboardFrame } from "@/components/Frame";
import { ProfileForm } from "@/components/onboarding";
import { loadStep } from "@/lib/page";
import { getConfig } from "@/lib/config";
import { todayFor } from "@/lib/clock";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { data } = await loadStep(["profile"], async (tx, userId) => ({ c: await getConfig(tx), today: await todayFor(tx, userId) }));
  return (
    <OnboardFrame title="About you" step={1}>
      <ProfileForm today={data.today} minAge={data.c.min_age} />
    </OnboardFrame>
  );
}
