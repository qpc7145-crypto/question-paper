"use client";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/client";
import { Alert, Card, Field, PageHeader, Spinner } from "@/components/ui";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default function SettingsPage() {
  const { data, loading } = useApi<{ currentSemester: string; institutionName: string; semesters: string[] }>("/api/controller/settings");
  const [f, setF] = useState({ currentSemester: "", institutionName: "" });
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  useEffect(() => { if (data) setF({ currentSemester: data.currentSemester, institutionName: data.institutionName }); }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/controller/settings", { method: "PUT", json: f });
      setMsg({ tone: "success", text: "Settings saved" });
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    }
  }

  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card title="Institution" className="max-w-xl">
          <form onSubmit={save} className="space-y-4">
            {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
            <Field label="Institution name" hint="Printed on the header of every question paper">
              <input className="input" required value={f.institutionName} onChange={(e) => setF({ ...f, institutionName: e.target.value })} />
            </Field>
            <Field label="Current semester" hint="Model papers can only be released from semesters other than this one">
              <input className="input" required list="sem" value={f.currentSemester} onChange={(e) => setF({ ...f, currentSemester: e.target.value })} />
              <datalist id="sem">{data?.semesters.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <button className="btn-primary">Save settings</button>
          </form>
        </Card>
        <ChangePasswordForm />
      </div>
    </>
  );
}
