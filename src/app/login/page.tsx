"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { Alert, Field } from "@/components/ui";
import { AuthFrame } from "@/components/AuthFrame";

function LoginForm() {
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ redirect: string }>("/api/auth/login", { method: "POST", json: { email, password } });
      const next = sp.get("next");
      const area = r.redirect.split("/").slice(0, 2).join("/");
      // Only follow a relative "next" inside the user's own area.
      window.location.href = next && next.startsWith(area + "/") && !r.redirect.endsWith("/biodata") ? next : r.redirect;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {sp.get("reset") && <Alert tone="success">Password updated. Sign in with your new password.</Alert>}
      {error && <Alert>{error}</Alert>}
      <Field label="Email">
        <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password">
        <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <button className="btn-primary w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
      </button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="font-medium text-[#1D4ED8] hover:underline">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthFrame title="Sign in" subtitle="Authorised examination personnel only">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}
