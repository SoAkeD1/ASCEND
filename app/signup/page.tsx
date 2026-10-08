import { redirect } from "next/navigation";
import { OnboardFrame } from "@/components/Frame";
import { SignUpForm } from "@/components/SignUpForm";
import { currentSession } from "@/lib/auth/current";
import { otpChannel } from "@/lib/providers/otp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign up · Ascend" };

export default async function SignUpPage() {
  if (await currentSession()) redirect("/home");
  return (
    <OnboardFrame title="Create your account" back="/">
      <SignUpForm channel={otpChannel()} />
    </OnboardFrame>
  );
}
