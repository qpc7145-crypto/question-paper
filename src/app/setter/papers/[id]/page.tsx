"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { api, fmtDateTime, useApi } from "@/lib/client";
import { Alert, PageHeader, Pill, Spinner, StatusBadge } from "@/components/ui";
import { PaperWorkspace, type PaperContent } from "@/components/PaperWorkspace";
import { confirmAction } from "@/components/ConfirmDialog";

type SetterPaper = PaperContent & {
  id: string; editable: boolean; isLate: boolean; submittedAt: string | null;
  subject: { code: string; title: string; semester: string; examType: string; examDate: string; submissionDeadline: string };
};

// Mirrors the server's rule (papers/lifecycle.ts hasContent), so an empty paper is caught
// before the confirm dialog. The server still enforces it.
function savedHasContent(p: PaperContent) {
  if (p.format === "FILE") return !!p.file;
  const text = (s?: string) => (s ?? "").replace(/<[^>]*>/g, "").trim().length > 0;
  return p.mode === "STRUCTURED" ? text(p.sectionAHtml) || text(p.sectionBHtml) || text(p.sectionCHtml) : text(p.contentHtml);
}

export default function SetterPaperPage({ params }: { params: { id: string } }) {
  const { data, error, loading, setData } = useApi<{ paper: SetterPaper }>(`/api/setter/papers/${params.id}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const dirty = useRef(false);

  async function submit() {
    if (dirty.current) return setMsg("Save your draft before submitting.");
    if (data && !savedHasContent(data.paper)) return setMsg("This paper has no content yet. Write it in the editor or upload a file, save, then submit.");
    if (!(await confirmAction("Submit this paper as final? You will not be able to edit it afterwards.", { title: "Submit final paper", confirmLabel: "Submit" }))) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ paper: SetterPaper }>(`/api/setter/papers/${params.id}`, { method: "POST" });
      setData({ paper: r.paper });
      setKey((k) => k + 1);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  if (error || !data) return <Alert>{error ?? "Not found"}</Alert>;
  const p = data.paper;
  const overdue = p.status === "DRAFT" && new Date(p.subject.submissionDeadline) < new Date();

  return (
    <>
      <Link href="/setter" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> My papers</Link>
      <PageHeader
        title={`${p.subject.code} — ${p.subject.title}`}
        description={<>{p.subject.examType} · {p.subject.semester} · Submission deadline {fmtDateTime(p.subject.submissionDeadline)}</>}
        actions={<><StatusBadge status={p.status} />{p.isLate && <Pill tone="amber">Late</Pill>}</>}
      />
      <div className="mb-4 space-y-2">
        {msg && <Alert>{msg}</Alert>}
        {overdue && <Alert tone="warning">The submission deadline has passed. You can still submit; it will be recorded as late.</Alert>}
        {!p.editable && <Alert tone="info">Submitted on {fmtDateTime(p.submittedAt)}. The paper is now with the Examinations Office and can no longer be edited by you.</Alert>}
      </div>
      <PaperWorkspace
        key={key}
        paper={p}
        editable={p.editable}
        saveUrl={`/api/setter/papers/${p.id}`}
        uploadUrl={`/api/papers/${p.id}/file`}
        previewUrl={`/api/papers/${p.id}/preview`}
        dirtyRef={dirty}
        onSaved={(paper) => { setMsg(null); setData({ paper: paper as SetterPaper }); }}
        actions={
          p.editable && (
            <button className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit final paper
            </button>
          )
        }
      />
    </>
  );
}
