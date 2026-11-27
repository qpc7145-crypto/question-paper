"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi } from "@/lib/client";
import { Alert, Card, Field } from "@/components/ui";

export function DisplayNameForm({ className = "max-w-xl" }: { className?: string }) {
  const router = useRouter();
  const { data } = useApi<{ user: { displayName: string } }>("/api/auth/me");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setName(data.user.displayName); }, [data]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const displayName = name.trim();
    if (displayName.length < 2) return setMsg({ tone: "error", text: "Display name must be at least 2 characters" });
    setBusy(true);
    try {
      await api("/api/auth/profile", { method: "PATCH", json: { displayName } });
      setName(displayName);
      setMsg({ tone: "success", text: "Display name updated" });
      router.refresh(); // re-render the sidebar with the new name
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Display name" className={className}>
      <form onSubmit={submit} className="space-y-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Field label="Display name" hint="Shown in the sidebar and to other users of the system">
          <input className="input" required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={!data} />
        </Field>
        <button className="btn-primary" disabled={busy || !data}>Save name</button>
      </form>
    </Card>
  );
}
