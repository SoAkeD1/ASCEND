import { OnboardFrame } from "@/components/Frame";
import { AutopayForm } from "@/components/onboarding";
import { loadStep } from "@/lib/page";
import { getConfig } from "@/lib/config";
import { getLine, getUser } from "@/lib/services/common";
import { suggestedDueDay } from "@/lib/services/onboarding";
import { firstName } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AutopayPage() {
  const { data } = await loadStep(["ladder"], async (tx, userId) => ({
    c: await getConfig(tx),
    line: await getLine(tx, userId),
    suggested: await suggestedDueDay(tx, userId),
    u: await getUser(tx, userId),
  }));
  const { c, line, suggested, u } = data;
  if (!line) return null;
  return (
    <OnboardFrame title="AutoPay" step={9} back="/start/ladder">
      <AutopayForm payday={line.payday} suggested={suggested} offset={c.payday_due_offset_days} limit={line.chosenLimit} firstName={firstName(u.fullName)} />
    </OnboardFrame>
  );
}
