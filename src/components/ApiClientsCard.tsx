"use client";
import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { Alert, Card, Field, Pill } from "@/components/ui";
import { confirmAction } from "@/components/ConfirmDialog";

type Client = { id: string; name: string; keyPrefix: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : "Never");

// FR-27/FR-28: one API key per external system (Result System, ERP), scoped and revocable.
export function ApiClientsCard() {
  const { data, loading, reload } = useApi<{ clients: Client[]; modules: string[] }>("/api/controller/api-clients");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await api<{ client: Client; key: string }>("/api/controller/api-clients", { method: "POST", json: { name, scopes } });
      setNewKey({ name: r.client.name, key: r.key });
      setName("");
      setScopes([]);
      reload();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    }
  }

  async function revoke(c: Client) {
    if (!(await confirmAction(`Revoke the key for “${c.name}”? That system will stop working until it is given a new key.`, { confirmLabel: "Revoke" }))) return;
    try {
      await api(`/api/controller/api-clients/${c.id}`, { method: "DELETE" });
      setMsg({ tone: "success", text: `Key for ${c.name} revoked` });
      reload();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    }
  }

  const toggle = (m: string) => setScopes((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  return (
    <Card title="Integration API keys" className="max-w-3xl">
      <div className="space-y-4">
        <p className="text-sm text-muted">Give each external system its own key, limited to the modules it uses. Systems send it as the <code>x-api-key</code> header.</p>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        {newKey && (
          <Alert tone="warning">
            <p className="font-medium">Key for {newKey.name}. Copy it now: it will not be shown again.</p>
            <code className="mt-2 block break-all rounded bg-white/70 p-2 text-xs">{newKey.key}</code>
          </Alert>
        )}
        {loading ? null : (data?.clients.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">No API keys yet.</p>
        ) : (
          <ul className="divide-y divide-[#E2E8F0] rounded-md border border-[#E2E8F0]">
            {data!.clients.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name} {c.revokedAt && <Pill tone="red">Revoked</Pill>}</p>
                  <p className="text-xs text-muted"><code>{c.keyPrefix}…</code> · {c.scopes.join(", ")} · created {fmt(c.createdAt)} · last used {fmt(c.lastUsedAt)}</p>
                </div>
                {!c.revokedAt && <button type="button" className="btn-secondary" onClick={() => revoke(c)}>Revoke</button>}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={create} className="flex flex-wrap items-end gap-4">
          <Field label="System name" className="min-w-[200px] flex-1">
            <input className="input" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Result System" />
          </Field>
          <fieldset className="flex flex-wrap gap-3 pb-2 text-sm">
            <legend className="sr-only">Allowed modules</legend>
            {(data?.modules ?? []).map((m) => (
              <label key={m} className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={scopes.includes(m)} onChange={() => toggle(m)} /> {m}
              </label>
            ))}
          </fieldset>
          <button className="btn-primary" disabled={!name.trim() || scopes.length === 0}>Create key</button>
        </form>
      </div>
    </Card>
  );
}
