"use client";
import { useState } from "react";
import { Building2, Loader2, Plus } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Alert, Card, Empty, Field, PageHeader, Pill, Spinner, Table } from "@/components/ui";

type Centre = {
  id: string; code: string; name: string; address: string; city: string; capacity: number;
  superintendent: { id: string; displayName: string; email: string; superintendent: { fullName: string; phone: string } | null } | null;
  _count: { assignments: number };
};
type Sup = { id: string; displayName: string; email: string; centre: { id: string } | null };

export default function CentresPage() {
  const { data, error, loading, reload } = useApi<{ centres: Centre[]; superintendents: Sup[] }>("/api/controller/centres");
  const [form, setForm] = useState({ code: "", name: "", address: "", city: "", capacity: "0", superintendentId: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const free = (data?.superintendents ?? []).filter((s) => !s.centre);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/controller/centres", { method: "POST", json: { ...form, capacity: Number(form.capacity), superintendentId: form.superintendentId || null } });
      setForm({ code: "", name: "", address: "", city: "", capacity: "0", superintendentId: "" });
      setShow(false);
      setMsg({ tone: "success", text: "Centre created" });
      reload();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function setSup(c: Centre, superintendentId: string) {
    try {
      await api(`/api/controller/centres/${c.id}`, { method: "PATCH", json: { superintendentId: superintendentId || null } });
      reload();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader title="Examination Centres" description="Centres and their supervising superintendents." actions={<button className="btn-primary" onClick={() => setShow((v) => !v)}><Plus className="h-4 w-4" /> New centre</button>} />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {error && <Alert>{error}</Alert>}
      {show && (
        <Card title="Create centre" className="mb-6">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-3">
            <Field label="Centre code"><input className="input uppercase" required value={form.code} onChange={set("code")} /></Field>
            <Field label="Name" className="sm:col-span-2"><input className="input" required value={form.name} onChange={set("name")} /></Field>
            <Field label="Address"><input className="input" value={form.address} onChange={set("address")} /></Field>
            <Field label="City"><input className="input" value={form.city} onChange={set("city")} /></Field>
            <Field label="Capacity"><input className="input" type="number" min={0} value={form.capacity} onChange={set("capacity")} /></Field>
            <Field label="Superintendent" className="sm:col-span-2">
              <select className="input" value={form.superintendentId} onChange={set("superintendentId")}>
                <option value="">— Assign later —</option>
                {free.map((s) => <option key={s.id} value={s.id}>{s.displayName} ({s.email})</option>)}
              </select>
            </Field>
            <div className="sm:col-span-3"><button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Create centre</button></div>
          </form>
        </Card>
      )}
      <Card bodyClass="p-0">
        {loading ? <div className="px-5"><Spinner /></div> : (data?.centres ?? []).length === 0 ? <Empty icon={<Building2 className="h-8 w-8" />} title="No centres yet" /> : (
          <Table>
            <thead className="bg-[#F8FAFC]"><tr><th className="th">Centre</th><th className="th">Location</th><th className="th">Capacity</th><th className="th">Superintendent</th><th className="th">Papers</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data!.centres.map((c) => (
                <tr key={c.id}>
                  <td className="td"><p className="font-medium">{c.code}</p><p className="text-muted">{c.name}</p></td>
                  <td className="td">{c.address}{c.address && c.city ? ", " : ""}{c.city}</td>
                  <td className="td tabular-nums">{c.capacity}</td>
                  <td className="td min-w-[14rem]">
                    <select className="input" value={c.superintendent?.id ?? ""} onChange={(e) => setSup(c, e.target.value)} aria-label={`Superintendent for ${c.code}`}>
                      <option value="">— None —</option>
                      {c.superintendent && <option value={c.superintendent.id}>{c.superintendent.displayName}</option>}
                      {free.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
                    </select>
                    {c.superintendent && (c.superintendent.superintendent ? <p className="mt-1 text-xs text-muted">{c.superintendent.superintendent.fullName} · {c.superintendent.superintendent.phone}</p> : <div className="mt-1"><Pill tone="amber">Bio-data pending</Pill></div>)}
                  </td>
                  <td className="td tabular-nums">{c._count.assignments}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
