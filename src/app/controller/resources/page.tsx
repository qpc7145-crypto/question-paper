"use client";
import { useRef, useState } from "react";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { api, fmtBytes, fmtDate, useApi } from "@/lib/client";
import { Alert, Card, Empty, Field, PageHeader, Pill, Spinner } from "@/components/ui";
import { confirmAction } from "@/components/ConfirmDialog";
import { SEMESTER_HINT, SEMESTER_PATTERN } from "@/lib/semesters";

type Resource = { id: string; kind: string; title: string; semester: string | null; createdAt: string; subject: { code: string; title: string; semester: string } | null; file: { originalName: string; sizeBytes: number } };
type Subject = { id: string; code: string; title: string; semester: string };

// FR-15: upload syllabus and model papers.
export default function ResourcesPage() {
  const { data, error, loading, reload } = useApi<{ resources: Resource[]; subjects: Subject[] }>("/api/controller/resources");
  const [form, setForm] = useState({ kind: "SYLLABUS", title: "", subjectId: "", semester: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setMsg({ tone: "error", text: "Choose a file" });
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    fd.append("file", file);
    try {
      await api("/api/controller/resources", { method: "POST", body: fd });
      setForm({ ...form, title: "" });
      if (fileRef.current) fileRef.current.value = "";
      setMsg({ tone: "success", text: "Uploaded" });
      reload();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: Resource) {
    if (!(await confirmAction(`Remove "${r.title}" from setters' downloads?`, { danger: true, confirmLabel: "Remove" }))) return;
    await api(`/api/controller/resources/${r.id}`, { method: "DELETE" }).catch((e) => setMsg({ tone: "error", text: e.message }));
    reload();
  }

  return (
    <>
      <PageHeader title="Syllabus & Model Papers" description="Setters can download syllabus (general or for their assigned subjects) and model papers before and after submission." />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card title="Upload">
          <form onSubmit={upload} className="space-y-4">
            <Field label="Type">
              <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="SYLLABUS">Syllabus / guidelines</option>
                <option value="MODEL_PAPER">Model paper</option>
              </select>
            </Field>
            <Field label="Title"><input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Subject" hint="Leave empty to share with all setters">
              <select className="input" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                <option value="">— All setters —</option>
                {(data?.subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.semester}</option>)}
              </select>
            </Field>
            <Field label="Semester (optional)" hint={SEMESTER_HINT}><input className="input" pattern={SEMESTER_PATTERN} title={SEMESTER_HINT} placeholder="Fall 2026" value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} /></Field>
            <Field label="File" hint="PDF, DOC or DOCX"><input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-[#CBD5E1] file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium" required /></Field>
            <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload</button>
          </form>
        </Card>
        <Card title="Library" bodyClass="p-0">
          {loading ? <div className="px-5"><Spinner /></div> : (data?.resources ?? []).length === 0 ? <Empty title="Nothing uploaded yet" /> : (
            <ul className="divide-y divide-line">
              {data!.resources.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <FileText className="h-5 w-5 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.title} <Pill tone={r.kind === "SYLLABUS" ? "blue" : "green"}>{r.kind === "SYLLABUS" ? "Syllabus" : "Model"}</Pill></p>
                    <p className="text-xs text-muted">{r.subject ? `${r.subject.code} · ${r.semester ?? r.subject.semester}` : `All setters · ${r.semester ?? "All semesters"}`} · {r.file.originalName} · {fmtBytes(r.file.sizeBytes)} · {fmtDate(r.createdAt)}</p>
                  </div>
                  <a className="btn-secondary btn-sm" href={`/api/resources/${r.id}/download`}><Download className="h-3.5 w-3.5" /></a>
                  <button className="btn-secondary btn-sm text-red-600" onClick={() => remove(r)} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
