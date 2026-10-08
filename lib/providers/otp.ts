/**
 * Sends sign-in codes. AUTH_CHANNEL picks email (default) or sms; OTP_PROVIDER picks who delivers.
 * The sandbox provider sends nothing and returns the code so the screen can show it, clearly
 * labelled "Sandbox · simulated provider". Real providers never return the code.
 */
export type OtpChannel = "email" | "sms";
export type OtpResult = { sandboxCode?: string };

export interface OtpSender {
  channel: OtpChannel;
  sandbox: boolean;
  send(to: string, code: string): Promise<OtpResult>;
}

const sandbox = (channel: OtpChannel): OtpSender => ({
  channel,
  sandbox: true,
  send: async (_to, code) => ({ sandboxCode: code }),
});

const resend: OtpSender = {
  channel: "email",
  sandbox: false,
  async send(to, code) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to,
        subject: `Your Ascend code: ${code}`,
        text: `Your Ascend sign-in code is ${code}. It expires soon. Never share it with anyone.`,
      }),
    });
    if (!res.ok) throw new Error(`Email provider failed (${res.status}).`);
    return {};
  },
};

/** SmsProvider adapter: Twilio. MSG91 would be another object with the same shape. */
const twilio: OtpSender = {
  channel: "sms",
  sandbox: false,
  async send(to, code) {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: `Your Ascend code is ${code}. Never share it.` }),
    });
    if (!res.ok) throw new Error(`SMS provider failed (${res.status}).`);
    return {};
  },
};

export function otpChannel(): OtpChannel {
  return process.env.AUTH_CHANNEL === "sms" ? "sms" : "email";
}

export function getOtpSender(): OtpSender {
  const channel = otpChannel();
  const provider = process.env.OTP_PROVIDER ?? "sandbox";
  if (provider === "resend" && channel === "email") return resend;
  if (provider === "twilio" && channel === "sms") return twilio;
  return sandbox(channel);
}
