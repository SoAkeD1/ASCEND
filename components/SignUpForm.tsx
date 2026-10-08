"use client";

import { useState } from "react";
import { api, ErrorNote, useAction } from "./client";
import { SandboxTag } from "./bits";

export function SignUpForm({ channel }: { channel: "email" | "sms" }) {
  const { busy, error, run, router } = useAction();
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [sandboxCode, setSandboxCode] = useState<string | null>(null);
  const isEmail = channel === "email";

  const send = () =>
    run(
      () => api<{ sandboxCode: string | null }>("auth/request", { identifier }),
      (r) => {
        setSent(true);
        setSandboxCode(r.sandboxCode);
      },
    );
  const verify = () => run(() => api<{ next: string }>("auth/verify", { identifier, code }), (r) => router.push(r.next));

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sent) send();
        else verify();
      }}
    >
      {!sent ? (
        <>
          <div>
            <h2 className="h-title">{isEmail ? "Let's start with your email" : "Let's start with your number"}</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted">We&apos;ll send a one-time code. No spam, no marketing calls.</p>
          </div>
          <div>
            <label htmlFor="su-id" className="label">
              {isEmail ? "Email address" : "Mobile number"}
            </label>
            <input
              id="su-id"
              className="field"
              type={isEmail ? "email" : "tel"}
              autoComplete={isEmail ? "email" : "tel"}
              inputMode={isEmail ? "email" : "tel"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <h2 className="h-title">Enter the 6-digit code</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted">Sent to {identifier}. It works for a few minutes.</p>
          </div>
          {sandboxCode && (
            <div className="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-[#B9C3BC] bg-white px-4 py-3">
              <div>
                <SandboxTag />
                <p className="mt-1.5 text-[13px] text-muted">No real {isEmail ? "email" : "SMS"} is sent in the sandbox. Your code:</p>
              </div>
              <button type="button" className="text-[22px] font-[750] tracking-[0.18em] text-teal num" onClick={() => setCode(sandboxCode)} aria-label="Use this code">
                {sandboxCode}
              </button>
            </div>
          )}
          <div>
            <label htmlFor="su-otp" className="label">
              One-time code
            </label>
            <input
              id="su-otp"
              className="field text-center text-[22px] tracking-[0.3em] num"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </div>
          <button type="button" className="btn-link self-start" onClick={() => (setSent(false), setCode(""), setSandboxCode(null))}>
            Use a different {isEmail ? "email" : "number"}
          </button>
        </>
      )}
      <ErrorNote error={error} />
      <p className="text-[12px] leading-relaxed text-muted">
        By continuing you agree to our Terms and Privacy Policy. We never access your contacts, photos, SMS or social media.
      </p>
      <div className="mt-auto pt-2">
        <button type="submit" className="btn-primary w-full" disabled={busy || (!sent ? identifier.length < 3 : code.length !== 6)}>
          {busy ? "Please wait…" : !sent ? "Send code" : "Verify"}
        </button>
      </div>
    </form>
  );
}
