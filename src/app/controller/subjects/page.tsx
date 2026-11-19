"use client";
import Link from "next/link";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { api, fmtDateTime, qs, useApi } from "@/lib/client";
import { EXAM_TYPES } from "@/lib/constants";
import { Alert, Card, Empty, Field, PageHeader, SemesterFilter, Spinner, StatusBadge, Table } from "@/components/ui";

type Subject = {
  id: string; code: string; title: string; semester: string; examType: string; examDate: string; submissionDeadline: string;
  setter: { id: string; displayName: string; email: string } | null; paper: { id: string; status: string } | null;
};
type Setter = { id: string; displayName: string; email: string; isActive: boolean; bioDataComplete: boolean | null; setterProfile: { subjectsEligible: string } | null };

const EMPTY = { code: "", title: "", semester: "", examType: "FINAL", examDate: "", submissionDeadline: "", setterId: "" };

export default function SubjectsPage() {
  const [semester, setSemester] = useState("");
  const { data, error, loading, reload } = useApi<{ subjects: Subject[]; semesters: string[] }>(`/api/controller/subjects${qs({ semester })}`);
  const setters = useApi<{ users: Setter[] }>("/api/controller/users?role=SETTER");
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const activeSetters = (setters.data?.users ?? []).filter((s) => s.isActive);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/controller/subjects", {
        method: "POST",
        json: { ...form, examDate: new Date(form.examDate).toISOString(), submissionDeadline: new Date(form.submissionDeadline).toISOString(), setterId: form.setterId || null },
      });
      setForm({ ...EMPTY, semester: form.semester });
      setShowForm(false);
      setMsg({ tone: "success", text: `Subject ${form.code.toUpperCase()} created` });
      reload();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function assign(s: Subject, setterId: string) {
    if (s.setter && !window.confirm("Re-assigning will discard the current setter's draft for this subject. Continue?")) return reload();
    try {
      await api(`/api/controller/subjects/${s.id}`, { method: "PATCH", json: { setterId: setterId || null } });
      setMsg({ tone: "success", text: `Setter updated for ${s.code}` });
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    }
    reload();
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Subjects & Assignment"
        description="Create subjects and assign each to a Paper Setter. Typist and centre assignment is done on the paper page."
        actions={
          <>
            <SemesterFilter semesters={data?.semesters ?? []} value={semester} onChange={setSemester} />
            <button className="btn-primary" onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" /> New subject</button>
          </>
        }
      />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {error && <Alert>{error}</Alert>}

      {showForm && (
        <Card title="Create subject" className="mb-6">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Subject code"><input className="input uppercase" required placeholder="CS-301" value={form.code} onChange={set("code")} /></Field>
            <Field label="Title" className="lg:col-span-2"><input className="input" required value={form.title} onChange={set("title")} /></Field>
            <Field label="Semester" hint="e.g. Fall 2026"><input className="input" required list="semesters" value={form.semester} onChange={set("semester")} /></Field>
            <datalist id="semesters">{(data?.semesters ?? []).map((s) => <option key={s} value={s} />)}</datalist>
            <Field label="Exam type">
              <select className="input" value={form.examType} onChange={set("examType")}>{EXAM_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            </Field>
            <Field label="Exam date & time"><input className="input" type="datetime-local" required value={form.examDate} onChange={set("examDate")} /></Field>
            <Field label="Submission deadline"><input className="input" type="datetime-local" required value={form.submissionDeadline} onChange={set("submissionDeadline")} /></Field>
            <Field label="Paper setter (optional)">
              <select className="input" value={form.setterId} onChange={set("setterId")}>
                <option value="">— Assign later —</option>
                {activeSetters.map((s) => <option key={s.id} value={s.id}>{s.displayName}{s.bioDataComplete ? "" : " (bio-data pending)"}</option>)}
              </select>
            </Field>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Create subject</button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </Card>
      )}

      <Card bodyClass="p-0">
        {loading ? <div className="px-5"><Spinner /></div> : (data?.subjects ?? []).length === 0 ? <Empty title="No subjects yet" /> : (
          <Table>
            <thead className="bg-[#F8FAFC]">
              <tr><th className="th">Subject</th><th className="th">Semester / Type</th><th className="th">Deadline</th><th className="th">Exam</th><th className="th">Setter</th><th className="th">Paper</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data!.subjects.map((s) => {
                const lockedSetter = !!s.paper && s.paper.status !== "DRAFT";
                return (
                  <tr key={s.id}>
                    <td className="td"><p className="font-medium">{s.code}</p><p className="text-muted">{s.title}</p></td>
                    <td className="td">{s.semester}<p className="text-xs text-muted">{s.examType}</p></td>
                    <td className="td whitespace-nowrap">{fmtDateTime(s.submissionDeadline)}</td>
                    <td className="td whitespace-nowrap">{fmtDateTime(s.examDate)}</td>
                    <td className="td min-w-[12rem]">
                      {lockedSetter ? (
                        <span>{s.setter?.displayName}</span>
                      ) : (
                        <select className="input" value={s.setter?.id ?? ""} onChange={(e) => assign(s, e.target.value)} aria-label={`Setter for ${s.code}`}>
                          <option value="">— Unassigned —</option>
                          {activeSetters.map((x) => <option key={x.id} value={x.id}>{x.displayName}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="td">
                      {s.paper ? <Link href={`/controller/papers/${s.paper.id}`} className="inline-flex flex-col gap-1"><StatusBadge status={s.paper.status} /><span className="text-xs text-[#1D4ED8] hover:underline">Open paper</span></Link> : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
