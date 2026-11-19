"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { api, fmtDateTime, useApi } from "@/lib/client";
import { Alert, Card, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { PaperWorkspace, type PaperContent } from "@/components/PaperWorkspace";

type TypistPaper = PaperContent & {
  id: string; editable: boolean; canSend: boolean; revisionCount: number; sentAt: string | null;
  subject: { code: string; title: string; semester: string; examType: string; examDate: string };
  centres: { code: string; name: string; city: string; availableFrom: string }[];
};

export default function TypistPaperPage({ params }: { params: { id: string } }) {
  const { data, error, loading, setData } = useApi<{ paper: TypistPaper }>(`/api/typist/papers/${params.id}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [key, setKey] = useState(0);
  const dirty = useRef(false);

  async function send() {
    if (dirty.current) return setMsg({ tone: "error", text: "Save your changes before sending." });
    if (!window.confirm("Send this paper to all assigned centres? It will unlock for each centre at its scheduled time.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ paper: TypistPaper }>(`/api/typist/papers/${params.id}`, { method: "POST" });
      setData({ paper: r.paper });
      setKey((k) => k + 1);
      setMsg({ tone: "success", text: "Paper sent to centres." });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  if (error || !data) return <Alert>{error ?? "Not found"}</Alert>;
  const p = data.paper;

  return (
    <>
      <Link href="/typist" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Assigned papers</Link>
      <PageHeader
        title={`${p.subject.code} — ${p.subject.title}`}
        description={<>{p.subject.examType} · {p.subject.semester} · Exam {fmtDateTime(p.subject.examDate)}</>}
        actions={<StatusBadge status={p.status} />}
      />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {!p.editable && <div className="mb-4"><Alert tone="info">This paper is {p.status.toLowerCase().replace(/_/g, " ")} and can no longer be modified.</Alert></div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
        <PaperWorkspace
          key={key}
          paper={p}
          editable={p.editable}
          revisionNote
          saveLabel="Save modification"
          saveUrl={`/api/typist/papers/${p.id}`}
          uploadUrl={`/api/papers/${p.id}/file`}
          previewUrl={`/api/papers/${p.id}/preview`}
          dirtyRef={dirty}
          onSaved={(paper) => setData({ paper: paper as TypistPaper })}
          actions={
            p.editable &&
            (p.canSend ? (
              <button className="btn-primary" onClick={send} disabled={busy || p.centres.length === 0}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to centres
              </button>
            ) : (
              <span className="btn-locked" title="The Controller has not delegated sending to you">Send to centres (not delegated)</span>
            ))
          }
        />
        <div className="space-y-4">
          <Card title="Distribution">
            {p.centres.length === 0 ? (
              <p className="text-sm text-muted">No centres assigned yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {p.centres.map((c) => (
                  <li key={c.code}>
                    <p className="font-medium">{c.code} — {c.name}</p>
                    <p className="text-xs text-muted">{c.city} · unlocks {fmtDateTime(c.availableFrom)}</p>
                  </li>
                ))}
              </ul>
            )}
            {p.sentAt && <p className="mt-3 text-xs text-muted">Sent {fmtDateTime(p.sentAt)}</p>}
          </Card>
          <Card title="Revisions"><p className="text-sm">{p.revisionCount} modification(s) recorded</p></Card>
        </div>
      </div>
    </>
  );
}
