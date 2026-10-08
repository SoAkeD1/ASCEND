import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppPage } from "@/components/AppPage";
import { AllCharges } from "@/components/bits";
import { SettingsControls } from "@/components/settings";
import { loadApp, asUser } from "@/lib/page";
import { getConsents } from "@/lib/services/onboarding";
import { kycRecords } from "@/lib/db/schema";
import { inr, longDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { st, userId } = await loadApp();
  const { data } = await asUser(async (tx) => ({
    consents: await getConsents(tx, userId),
    kyc: (await tx.select().from(kycRecords).where(eq(kycRecords.userId, userId)))[0] ?? null,
  }));
  const { c, line, user } = st;
  const fees = { interestPct: c.interest_on_time_pct, processing: c.processing_fee, annual: c.annual_fee, late: c.late_fee, foreclosure: c.foreclosure_fee };
  return (
    <AppPage st={st} title="Settings" back="/home" trust>
      <section className="card p-4">
        <p className="text-[18px] font-[750]">{user.fullName}</p>
        <p className="text-[13px] text-muted">{user.email ?? user.phone}</p>
        <dl className="mt-2 grid grid-cols-2 gap-y-1 text-[13px]">
          <dt className="text-muted">College</dt>
          <dd>
            {user.college} · year {user.year}
          </dd>
          <dt className="text-muted">KYC</dt>
          <dd>{data.kyc ? `PAN ••${data.kyc.panLast4} · Aadhaar ••${data.kyc.aadhaarLast4}` : "—"}</dd>
          <dt className="text-muted">Limit</dt>
          <dd className="num">{inr(line.currentLimit)}</dd>
          <dt className="text-muted">KFS</dt>
          <dd>
            v{line.kfsVersion} · accepted {line.kfsAcceptedAt ? longDate(line.kfsAcceptedAt.toISOString().slice(0, 10)) : "—"} ·{" "}
            <Link href="/settings/kfs" className="font-semibold text-teal underline">
              view
            </Link>
          </dd>
        </dl>
      </section>
      <SettingsControls
        consents={data.consents.map(({ type, purpose, granted }) => ({ type, purpose, granted }))}
        autopayOn={line.autopayOn}
        dueDay={line.dueDay!}
        selfFrozen={line.selfFrozen}
        grievanceDays={c.grievance_escalation_days}
      />
      <AllCharges fees={fees} />
      <p className="text-center text-[12px] text-muted">
        Grievance officer: {c.grievance_officer.name} · {c.grievance_officer.email} · {c.grievance_officer.phone}
      </p>
    </AppPage>
  );
}
