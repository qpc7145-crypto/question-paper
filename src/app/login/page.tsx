"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { Alert, Field } from "@/components/ui";
import { AuthFrame } from "@/components/AuthFrame";
import { ROLE_LABEL, type Role } from "@/lib/constants";

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
      {DEMO && <DemoRoles />}
    </form>
  );
}

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "1";
const DEMO_ROLES: { role: Role; hint: string }[] = [
  { role: "CONTROLLER", hint: "Full authority" },
  { role: "SETTER", hint: "Writes papers" },
  { role: "TYPIST", hint: "Formats papers" },
  { role: "SUPERINTENDENT", hint: "Downloads at exam time" },
];

function DemoRoles() {
  return (
    <div className="border-t border-line pt-4">
      <p className="text-sm font-medium">Design preview</p>
      <p className="mb-3 text-xs text-muted">No backend is connected. Pick a role to explore with sample data. Your changes are kept in this browser, so you can follow a paper from one role to the next.</p>
      <div className="grid grid-cols-2 gap-2">
        {DEMO_ROLES.map((r) => (
          <a key={r.role} href={`/api/demo/login?role=${r.role}`} className="btn-secondary flex-col items-start gap-0 text-left">
            <span className="text-sm font-medium">{ROLE_LABEL[r.role].replace(" of Examination", "")}</span>
            <span className="text-xs font-normal text-muted">{r.hint}</span>
          </a>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <a href="/api/demo/login?role=SETTER&user=u-set2" className="text-[#1D4ED8] hover:underline">Setter with bio-data pending</a>
        <button
          type="button"
          className="text-muted underline hover:text-ink"
          onClick={async () => {
            const { resetDemoData } = await import("@/lib/demo/api");
            resetDemoData();
            window.location.reload();
          }}
        >
          Reset sample data
        </button>
      </div>
    </div>
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
