"use client";
import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { Alert, Field } from "@/components/ui";
import { AuthFrame } from "@/components/AuthFrame";

// FR-3: self-service password reset via email OTP.
export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ message: string }>("/api/auth/forgot", { method: "POST", json: { email } });
      setMsg({ tone: "info", text: r.message });
      setStep("otp");
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setMsg({ tone: "error", text: "Passwords do not match" });
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/auth/reset", { method: "POST", json: { email, otp, password } });
      window.location.href = "/login?reset=1";
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Reset password" subtitle={step === "email" ? "We'll email you a 6-digit code" : `Enter the code sent to ${email}`}>
      <div className="space-y-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        {step === "email" ? (
          <form onSubmit={requestCode} className="space-y-4">
            <Field label="Email">
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send code
            </button>
          </form>
        ) : (
          <form onSubmit={reset} className="space-y-4">
            <Field label="6-digit code">
              <input className="input tracking-[0.4em]" inputMode="numeric" pattern="\d{6}" maxLength={6} required value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="New password" hint="At least 10 characters with upper-case, lower-case and a number">
              <input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Confirm new password">
              <input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
            </button>
            <button type="button" className="btn-secondary w-full" onClick={() => setStep("email")}>
              Use a different email
            </button>
          </form>
        )}
        <p className="text-center text-sm">
          <Link href="/login" className="font-medium text-[#1D4ED8] hover:underline">Back to sign in</Link>
        </p>
      </div>
    </AuthFrame>
  );
}
