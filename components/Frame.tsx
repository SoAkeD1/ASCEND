import type { ReactNode } from "react";
import { AppBar, Stepper } from "./bits";

/** The phone-width column every student screen lives in. Centred, with a soft edge, on desktop. */
export function MobileFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#EEF1EC] sm:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-paper sm:min-h-[calc(100vh-48px)] sm:overflow-hidden sm:rounded-[28px] sm:shadow-[0_30px_60px_-30px_rgba(20,26,34,0.35)]">
        {children}
      </div>
    </div>
  );
}

export const ONBOARD_STEPS = ["Profile", "Identity", "Enrolment", "Consent", "Bureau", "Cash flow", "Limit", "Ladder", "AutoPay"] as const;

export function OnboardFrame({
  title,
  step,
  back,
  children,
}: {
  title: string;
  step?: number;
  back?: string;
  children: ReactNode;
}) {
  return (
    <MobileFrame>
      <AppBar title={title} mode="onboard" back={back} />
      {step && <Stepper step={step} total={ONBOARD_STEPS.length} label={ONBOARD_STEPS[step - 1]} />}
      <main className="flex flex-1 animate-asc-in flex-col gap-4 px-4 pb-6 pt-2">{children}</main>
    </MobileFrame>
  );
}

export function Heading({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div>
      <h2 className="h-title">{title}</h2>
      {sub && <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}
