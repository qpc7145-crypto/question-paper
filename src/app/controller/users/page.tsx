"use client";
import { useState } from "react";
import { Copy, Loader2, Plus, UserCheck, UserX } from "lucide-react";
import { api, fmtDateTime, useApi } from "@/lib/client";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { Alert, Card, Empty, Field, PageHeader, Pill, Spinner, Table } from "@/components/ui";
import { confirmAction } from "@/components/ConfirmDialog";

type User = {
  id: string; email: string; role: Role; displayName: string; isActive: boolean; locked: boolean; lastLoginAt: string | null;
  bioDataComplete: boolean | null; setterProfile: { fullName: string; specialization: string; subjectsEligible: string } | null; centre: { code: string; name: string } | null;
};
type Detail = { user: Record<string, unknown> & { setterProfile: Record<string, unknown> | null; superintendent: Record<string, unknown> | null } };

export default function UsersPage() {
  const [role, setRole] = useState("");
  const { data, error, loading, reload } = useApi<{ users: User[] }>(`/api/controller/users${role ? `?role=${role}` : ""}`);
  const [form, setForm] = useState({ email: "", displayName: "", role: "SETTER", centreId: "" });
  const centres = useApi<{ centres: { id: string; code: string; name: string; superintendent: { id: string } | null }[] }>("/api/controller/centres");
  const freeCentres = (centres.data?.centres ?? []).filter((c) => !c.superintendent);
  const [editBio, setEditBio] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: React.ReactNode } | null>(null);
  const [detail, setDetail] = useState<Detail["user"] | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ temporaryPassword: string | null }>("/api/controller/users", { method: "POST", json: { ...form, centreId: form.role === "SUPERINTENDENT" && form.centreId ? form.centreId : null } });
      setMsg({
        tone: "success",
        text: (
          <span>
            Account created for <strong>{form.email}</strong>. Temporary password (shown once):{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono">{r.temporaryPassword}</code>
            <button className="ml-2 inline-flex items-center gap-1 text-xs underline" onClick={() => navigator.clipboard.writeText(r.temporaryPassword ?? "")}><Copy className="h-3 w-3" /> copy</button>
          </span>
        ),
      });
      setForm({ email: "", displayName: "", role: form.role, centreId: "" });
      setShow(false);
      reload();
      centres.reload();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function patch(u: User, body: Record<string, unknown>) {
    try {
      await api(`/api/controller/users/${u.id}`, { method: "PATCH", json: body });
      reload();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    }
  }

  async function view(u: User) {
    const r = await api<Detail>(`/api/controller/users/${u.id}`);
    setEditBio(false);
    setDetail(r.user);
  }

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Create and manage Paper Setter, Typist and Centre Superintendent accounts."
        actions={
          <>
            <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
              <option value="">All roles</option>
              <option value="SETTER">Paper Setters</option>
              <option value="TYPIST">Typists</option>
              <option value="SUPERINTENDENT">Superintendents</option>
            </select>
            <button className="btn-primary" onClick={() => setShow((v) => !v)}><Plus className="h-4 w-4" /> New account</button>
          </>
        }
      />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {error && <Alert>{error}</Alert>}
      {show && (
        <Card title="Create account" className="mb-6">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-4">
            <Field label="Role">
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="SETTER">Paper Setter</option>
                <option value="TYPIST">Paper Typist</option>
                <option value="SUPERINTENDENT">Centre Superintendent</option>
              </select>
            </Field>
            <Field label="Display name"><input className="input" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
            <Field label="Email" className="sm:col-span-2"><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            {form.role === "SUPERINTENDENT" && (
              <Field label="Examination centre" hint="Centres that already have a Superintendent are not listed" className="sm:col-span-2">
                <select className="input" value={form.centreId} onChange={(e) => setForm({ ...form, centreId: e.target.value })}>
                  <option value="">— Link later on the Centres page —</option>
                  {freeCentres.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
              </Field>
            )}
            <div className="sm:col-span-4">
              <p className="mb-3 text-xs text-muted">A strong temporary password is generated and shown once. The user can change it, or reset via email OTP.</p>
              <button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account</button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card bodyClass="p-0">
          {loading ? <div className="px-5"><Spinner /></div> : (data?.users ?? []).length === 0 ? <Empty title="No accounts" /> : (
            <Table>
              <thead className="bg-[#F8FAFC]"><tr><th className="th">User</th><th className="th">Role</th><th className="th">Bio-data</th><th className="th">Last login</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-line">
                {data!.users.map((u) => (
                  <tr key={u.id} className={u.isActive ? "" : "bg-slate-50 text-muted"}>
                    <td className="td">
                      <button className="text-left font-medium text-[#1D4ED8] hover:underline" onClick={() => view(u)}>{u.setterProfile?.fullName ?? u.displayName}</button>
                      <p className="text-xs text-muted">{u.email}</p>
                      {u.centre && <p className="text-xs text-muted">Centre {u.centre.code}</p>}
                    </td>
                    <td className="td">{ROLE_LABEL[u.role]}</td>
                    <td className="td">{u.bioDataComplete === null ? "—" : u.bioDataComplete ? <Pill tone="green">Complete</Pill> : <Pill tone="amber">Pending</Pill>}</td>
                    <td className="td whitespace-nowrap">{fmtDateTime(u.lastLoginAt)}</td>
                    <td className="td whitespace-nowrap text-right">
                      {u.locked && <button className="btn-secondary btn-sm mr-2" onClick={() => patch(u, { unlock: true })}>Unlock</button>}
                      {u.isActive ? (
                        <button className="btn-secondary btn-sm" onClick={async () => (await confirmAction(`Deactivate ${u.email}? They will be signed out immediately.`, { danger: true, confirmLabel: "Deactivate" })) && patch(u, { isActive: false })}><UserX className="h-3.5 w-3.5" /> Deactivate</button>
                      ) : (
                        <button className="btn-secondary btn-sm" onClick={() => patch(u, { isActive: true })}><UserCheck className="h-3.5 w-3.5" /> Activate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Bio-data" actions={detail && <button className="text-xs text-muted hover:text-ink" onClick={() => setDetail(null)}>Close</button>}>
          {!detail ? <p className="text-sm text-muted">Select a user to view their bio-data.</p> : detail.role === "SUPERINTENDENT" && editBio ? (
            <SuperintendentBioForm
              userId={String(detail.id)}
              initial={detail.superintendent}
              onCancel={() => setEditBio(false)}
              onSaved={async () => { setEditBio(false); await view({ id: String(detail.id) } as User); reload(); }}
            />
          ) : (
            <dl className="space-y-2 text-sm">
              <div><dt className="text-muted">Email</dt><dd>{String(detail.email)}</dd></div>
              {Object.entries(detail.setterProfile ?? detail.superintendent ?? {}).filter(([k]) => !["userId", "updatedAt", "completedAt"].includes(k)).map(([k, v]) => (
                <div key={k}><dt className="capitalize text-muted">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt><dd className="break-words">{String(v)}</dd></div>
              ))}
              {!detail.setterProfile && !detail.superintendent && <p className="text-muted">No bio-data on file.</p>}
              {detail.role === "SUPERINTENDENT" && (
                <button className="btn-secondary btn-sm mt-2" onClick={() => setEditBio(true)}>{detail.superintendent ? "Edit bio-data" : "Enter bio-data"}</button>
              )}
            </dl>
          )}
        </Card>
      </div>
    </>
  );
}

const SUP_FIELDS: [key: string, label: string, hint?: string][] = [
  ["fullName", "Full name"],
  ["cnic", "CNIC", "12345-1234567-1"],
  ["designation", "Designation"],
  ["organization", "Organization"],
  ["phone", "Phone"],
  ["address", "Address"],
];

// FR-5: the Controller can enter a Superintendent's bio-data on their behalf.
function SuperintendentBioForm({ userId, initial, onSaved, onCancel }: { userId: string; initial: Record<string, unknown> | null; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(SUP_FIELDS.map(([k]) => [k, String(initial?.[k] ?? "")])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/controller/users/${userId}/superintendent`, { method: "PUT", json: f });
      onSaved();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {err && <Alert>{err}</Alert>}
      {SUP_FIELDS.map(([k, label, hint]) => (
        <Field key={k} label={label} hint={hint}>
          <input
            className="input"
            required
            value={f[k]}
            placeholder={hint}
            pattern={k === "cnic" ? "[0-9]{5}-[0-9]{7}-[0-9]" : undefined}
            onChange={(e) => setF({ ...f, [k]: e.target.value })}
          />
        </Field>
      ))}
      <div className="flex gap-2">
        <button className="btn-primary btn-sm" disabled={busy}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save bio-data</button>
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
