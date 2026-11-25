"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { Alert, Card, Field } from "@/components/ui";

export function ChangePasswordForm({ className = "max-w-xl" }: { className?: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setMsg({ tone: "error", text: "Passwords do not match" });
    setBusy(true);
    try {
      await api("/api/auth/change-password", { method: "POST", json: { current, password } });
      setMsg({ tone: "success", text: "Password changed. Other sessions have been signed out." });
      setCurrent(""); setPassword(""); setConfirm("");
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Change password" className={className}>
      <form onSubmit={submit} className="space-y-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Field label="Current password">
          <input className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="At least 10 characters with upper-case, lower-case and a number">
          <input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <button className="btn-primary" disabled={busy}>Update password</button>
      </form>
    </Card>
  );
}
