"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Alert, Card, Field, PageHeader, Spinner } from "@/components/ui";

type Profile = {
  fullName: string; cnic: string; qualification: string; institution: string; experienceYears: number;
  specialization: string; phone: string; address: string; subjectsEligible: string;
};
const EMPTY: Profile = { fullName: "", cnic: "", qualification: "", institution: "", experienceYears: 0, specialization: "", phone: "", address: "", subjectsEligible: "" };

// FR-4: mandatory bio-data gate.
export default function SetterBioDataPage() {
  const router = useRouter();
  const { data, loading } = useApi<{ profile: Profile | null; email: string }>("/api/setter/biodata");
  const [f, setF] = useState<Profile>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const firstTime = !loading && !data?.profile;

  useEffect(() => {
    if (data?.profile) setF({ ...EMPTY, ...data.profile });
  }, [data]);

  const set = <K extends keyof Profile>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: k === "experienceYears" ? Number(e.target.value) : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/setter/biodata", { method: "PUT", json: f });
      if (firstTime) {
        router.replace("/setter");
        router.refresh();
      } else {
        setMsg({ tone: "success", text: "Bio-data updated" });
      }
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="Paper Setter Bio-Data" description="This information is visible only to the Controller of Examination." />
      {firstTime && (
        <div className="mb-4">
          <Alert tone="warning">
            <span className="inline-flex items-center gap-1.5 font-medium"><ShieldAlert className="h-4 w-4" /> Bio-data required</span>
            <span className="block">Complete all fields to unlock your paper assignments.</span>
          </Alert>
        </div>
      )}
      <Card>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {msg && <div className="sm:col-span-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
          <Field label="Full name"><input className="input" required value={f.fullName} onChange={set("fullName")} /></Field>
          <Field label="CNIC" hint="Format: 12345-1234567-1"><input className="input" required pattern="\d{5}-\d{7}-\d" placeholder="35202-1234567-1" value={f.cnic} onChange={set("cnic")} /></Field>
          <Field label="Highest qualification"><input className="input" required value={f.qualification} onChange={set("qualification")} /></Field>
          <Field label="Institution"><input className="input" required value={f.institution} onChange={set("institution")} /></Field>
          <Field label="Teaching experience (years)"><input className="input" type="number" min={0} max={60} required value={f.experienceYears} onChange={set("experienceYears")} /></Field>
          <Field label="Specialization"><input className="input" required value={f.specialization} onChange={set("specialization")} /></Field>
          <Field label="Contact phone"><input className="input" type="tel" required value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Email (account)"><input className="input" disabled value={data?.email ?? ""} /></Field>
          <Field label="Postal address" className="sm:col-span-2"><textarea className="input" rows={2} required value={f.address} onChange={set("address")} /></Field>
          <Field label="Subjects eligible to set" hint="Comma-separated subject codes or names, e.g. CS-201, CS-301" className="sm:col-span-2">
            <textarea className="input" rows={2} required value={f.subjectsEligible} onChange={set("subjectsEligible")} />
          </Field>
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {firstTime ? "Save & continue" : "Save changes"}
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
