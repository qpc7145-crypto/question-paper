"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Alert, Card, Field, PageHeader, Spinner } from "@/components/ui";

type Profile = { fullName: string; cnic: string; designation: string; organization: string; phone: string; address: string };
type Centre = { code: string; name: string; address: string; city: string; capacity: number } | null;
const EMPTY: Profile = { fullName: "", cnic: "", designation: "", organization: "", phone: "", address: "" };

// FR-5: Centre Superintendent bio-data form.
export default function CentreProfilePage() {
  const { data, loading } = useApi<{ profile: Profile | null; centre: Centre; email: string }>("/api/centre/profile");
  const [f, setF] = useState<Profile>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  useEffect(() => { if (data?.profile) setF({ ...EMPTY, ...data.profile }); }, [data]);
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/centre/profile", { method: "PUT", json: f });
      setMsg({ tone: "success", text: "Bio-data saved" });
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  const c = data?.centre;
  return (
    <>
      <PageHeader title="Centre & Superintendent Bio-Data" />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card title="Superintendent bio-data">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            {msg && <div className="sm:col-span-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
            {!data?.profile && <div className="sm:col-span-2"><Alert tone="warning">Please complete your bio-data.</Alert></div>}
            <Field label="Full name"><input className="input" required value={f.fullName} onChange={set("fullName")} /></Field>
            <Field label="CNIC" hint="12345-1234567-1"><input className="input" required pattern="\d{5}-\d{7}-\d" value={f.cnic} onChange={set("cnic")} /></Field>
            <Field label="Designation"><input className="input" required value={f.designation} onChange={set("designation")} /></Field>
            <Field label="Organization"><input className="input" required value={f.organization} onChange={set("organization")} /></Field>
            <Field label="Phone"><input className="input" type="tel" required value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Email"><input className="input" disabled value={data?.email ?? ""} /></Field>
            <Field label="Address" className="sm:col-span-2"><textarea className="input" rows={2} required value={f.address} onChange={set("address")} /></Field>
            <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button></div>
          </form>
        </Card>
        <Card title="Examination centre">
          {c ? (
            <dl className="space-y-2 text-sm">
              <div><dt className="text-muted">Code</dt><dd className="font-medium">{c.code}</dd></div>
              <div><dt className="text-muted">Name</dt><dd>{c.name}</dd></div>
              <div><dt className="text-muted">Address</dt><dd>{c.address}, {c.city}</dd></div>
              <div><dt className="text-muted">Capacity</dt><dd>{c.capacity}</dd></div>
              <p className="pt-2 text-xs text-muted">Centre details are maintained by the Controller of Examination.</p>
            </dl>
          ) : (
            <p className="text-sm text-muted">No centre is linked to your account yet.</p>
          )}
        </Card>
      </div>
    </>
  );
}
