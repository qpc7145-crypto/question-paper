"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Archive, ArrowLeft, BookOpen, Check, Loader2, Lock, RotateCcw, Send } from "lucide-react";
import { api, fmtDateTime, toLocalInput, useApi } from "@/lib/client";
import { Alert, Card, PageHeader, Pill, Spinner, StatusBadge } from "@/components/ui";
import { PaperWorkspace, type PaperContent } from "@/components/PaperWorkspace";

type CentreAssign = { centreId: string; code: string; name: string; city: string; availableFrom: string; firstAccessAt: string | null; firstDownloadAt: string | null; downloadCount: number };
type Paper = PaperContent & {
  id: string; status: string; revisionCount: number; submittedAt: string | null; isLate: boolean; sentAt: string | null;
  usedAt: string | null; archivedAt: string | null; releasedAsModel: boolean; typistCanSend: boolean;
  subject: { id: string; code: string; title: string; semester: string; examType: string; examDate: string; submissionDeadline: string };
  setter: { id: string; email: string; name: string }; typist: { id: string; email: string; name: string } | null;
  centres: CentreAssign[];
};
type Data = {
  paper: Paper;
  revisions: { id: string; editorRole: string; note: string; createdAt: string; editor: { displayName: string } }[];
  accessLogs: { id: string; kind: string; at: string; ip: string | null; centre: { code: string; name: string } }[];
  options: { typists: { id: string; displayName: string; email: string }[]; centres: { id: string; code: string; name: string; city: string }[] };
  currentSemester: string;
};

const FLOW = ["DRAFT", "SUBMITTED", "UNDER_MODIFICATION", "SENT_TO_CENTRE", "USED", "ARCHIVED"];

export default function ControllerPaperPage({ params }: { params: { id: string } }) {
  const { data, error, loading, reload } = useApi<Data>(`/api/controller/papers/${params.id}`);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const dirty = useRef(false);

  async function act(action: string, extra: Record<string, unknown> = {}, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    if (action === "send" && dirty.current) return setMsg({ tone: "error", text: "Save your edits before sending." });
    setBusy(action);
    setMsg(null);
    try {
      await api(`/api/controller/papers/${params.id}/actions`, { method: "POST", json: { action, ...extra } });
      await reload();
      setKey((k) => k + 1);
      setMsg({ tone: "success", text: "Updated" });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <Spinner />;
  if (error || !data) return <Alert>{error ?? "Not found"}</Alert>;
  const p = data.paper;
  const editable = p.status === "SUBMITTED" || p.status === "UNDER_MODIFICATION";
  const locked = p.status === "USED" || p.status === "ARCHIVED";
  const canSend = editable && p.centres.length > 0;
  const accessed = p.centres.some((c) => c.firstAccessAt || c.downloadCount > 0);
  const stepIdx = FLOW.indexOf(p.status);

  return (
    <>
      <Link href="/controller/papers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Papers</Link>
      <PageHeader
        title={`${p.subject.code} — ${p.subject.title}`}
        description={<>{p.subject.examType} · {p.subject.semester} · Exam {fmtDateTime(p.subject.examDate)} · Deadline {fmtDateTime(p.subject.submissionDeadline)}</>}
        actions={<><StatusBadge status={p.status} />{p.isLate && <Pill tone="amber">Late submission</Pill>}{p.releasedAsModel && <Pill tone="green">Released as model</Pill>}</>}
      />

      <ol className="mb-6 flex flex-wrap gap-y-2 text-xs" aria-label="Lifecycle">
        {FLOW.map((s, i) => (
          <li key={s} className="flex items-center">
            <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${i < stepIdx ? "bg-emerald-50 text-emerald-700" : i === stepIdx ? "bg-[#1D4ED8] text-white" : "bg-slate-100 text-slate-500"}`}>
              {i < stepIdx && <Check className="h-3 w-3" />}{s.replace(/_/g, " ")}
            </span>
            {i < FLOW.length - 1 && <span className="mx-1 h-px w-4 bg-line" />}
          </li>
        ))}
      </ol>

      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {p.status === "DRAFT" && <div className="mb-4"><Alert tone="info">The setter is still drafting this paper. You can edit it once it is submitted.</Alert></div>}
      {locked && (
        <div className="mb-4">
          <Alert tone={p.status === "ARCHIVED" ? "error" : "warning"}>
            <span className="inline-flex items-center gap-1.5"><Lock className="h-4 w-4" /> {p.status === "ARCHIVED" ? `Archived ${fmtDateTime(p.archivedAt)} — permanently locked.` : `Used at ${fmtDateTime(p.usedAt)} — content is locked.`}</span>
          </Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div>
          <PaperWorkspace
            key={key}
            paper={p}
            editable={editable}
            revisionNote
            saveLabel="Save edit"
            saveUrl={`/api/controller/papers/${p.id}`}
            uploadUrl={`/api/papers/${p.id}/file`}
            previewUrl={`/api/papers/${p.id}/preview`}
            dirtyRef={dirty}
            onSaved={() => reload()}
            actions={
              <>
                {editable && (
                  <button className="btn-primary" disabled={!canSend || busy !== null} title={canSend ? "" : "Assign at least one centre first"} onClick={() => act("send", {}, `Send ${p.subject.code} to ${p.centres.length} centre(s)?`)}>
                    {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to centres
                  </button>
                )}
                {p.status === "SENT_TO_CENTRE" && !accessed && (
                  <button className="btn-secondary" disabled={busy !== null} onClick={() => act("recall", {}, "Recall this paper for further modification?")}>
                    <RotateCcw className="h-4 w-4" /> Recall
                  </button>
                )}
                {p.status === "USED" && (
                  <button className="btn-danger" disabled={busy !== null} onClick={() => act("archive", {}, "Archive this paper? It will be permanently locked and hidden from all other roles. This cannot be undone.")}>
                    <Archive className="h-4 w-4" /> Archive &amp; lock
                  </button>
                )}
              </>
            }
          />
        </div>

        <div className="space-y-4">
          <Card title="Paper setter">
            <p className="text-sm font-medium">{p.setter.name}</p>
            <p className="text-xs text-muted">{p.setter.email}</p>
            <p className="mt-2 text-xs text-muted">Submitted: {fmtDateTime(p.submittedAt)}</p>
            <p className="mt-2 text-xs text-muted">Hidden from Typist and Centres.</p>
          </Card>

          <TypistPanel paper={p} typists={data.options.typists} disabled={locked || busy !== null} onSave={(typistId, canSend) => act("assignTypist", { typistId, canSend })} />
          <CentresPanel paper={p} centres={data.options.centres} disabled={locked || busy !== null} onSave={(centres) => act("setCentres", { centres })} />

          {p.status === "USED" && (
            <Card title={<span className="inline-flex items-center gap-2"><BookOpen className="h-4 w-4" /> Model paper</span>}>
              {p.subject.semester === data.currentSemester ? (
                <p className="text-sm text-muted">Current-semester papers cannot be released as model papers.</p>
              ) : (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1D4ED8]" checked={p.releasedAsModel} disabled={busy !== null} onChange={(e) => act("releaseModel", { released: e.target.checked })} />
                  <span>Release to Paper Setters as a model paper for reference</span>
                </label>
              )}
            </Card>
          )}

          <Card title={`Revisions (${p.revisionCount})`} bodyClass="p-0">
            {data.revisions.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No modifications yet.</p> : (
              <ul className="max-h-64 divide-y divide-line overflow-y-auto">
                {data.revisions.map((r) => (
                  <li key={r.id} className="px-5 py-2.5 text-sm">
                    <p><span className="font-medium">{r.editor.displayName}</span> <span className="text-xs text-muted">({r.editorRole.toLowerCase()})</span></p>
                    <p className="text-xs text-muted">{fmtDateTime(r.createdAt)}{r.note && ` — ${r.note}`}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Centre access log" bodyClass="p-0">
            {data.accessLogs.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No centre has accessed this paper.</p> : (
              <ul className="max-h-64 divide-y divide-line overflow-y-auto">
                {data.accessLogs.map((l) => (
                  <li key={l.id} className="px-5 py-2.5 text-sm">
                    <p><span className="font-medium">{l.centre.code}</span> · {l.kind.toLowerCase()}</p>
                    <p className="text-xs text-muted">{fmtDateTime(l.at)}{l.ip && ` · ${l.ip}`}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function TypistPanel({ paper, typists, disabled, onSave }: { paper: Paper; typists: Data["options"]["typists"]; disabled: boolean; onSave: (id: string | null, canSend: boolean) => void }) {
  const [typistId, setTypistId] = useState(paper.typist?.id ?? "");
  const [canSend, setCanSend] = useState(paper.typistCanSend);
  useEffect(() => { setTypistId(paper.typist?.id ?? ""); setCanSend(paper.typistCanSend); }, [paper.typist?.id, paper.typistCanSend]);
  const changed = typistId !== (paper.typist?.id ?? "") || canSend !== paper.typistCanSend;
  return (
    <Card title="Typist (Controller's nominee)">
      <select className="input" value={typistId} disabled={disabled} onChange={(e) => setTypistId(e.target.value)}>
        <option value="">— Not assigned —</option>
        {typists.map((t) => <option key={t.id} value={t.id}>{t.displayName} ({t.email})</option>)}
      </select>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1D4ED8]" checked={canSend} disabled={disabled || !typistId} onChange={(e) => setCanSend(e.target.checked)} />
        <span>Delegate “Send to centre” to this typist</span>
      </label>
      <button className="btn-secondary btn-sm mt-3" disabled={disabled || !changed} onClick={() => onSave(typistId || null, canSend)}>Save assignment</button>
    </Card>
  );
}

function CentresPanel({ paper, centres, disabled, onSave }: { paper: Paper; centres: Data["options"]["centres"]; disabled: boolean; onSave: (c: { centreId: string; availableFrom: string }[]) => void }) {
  const initial = () => Object.fromEntries(paper.centres.map((c) => [c.centreId, toLocalInput(c.availableFrom)]));
  const [sel, setSel] = useState<Record<string, string>>(initial);
  useEffect(() => setSel(initial()), [paper.centres]); // eslint-disable-line react-hooks/exhaustive-deps
  const fixed = new Set(paper.centres.filter((c) => c.downloadCount > 0).map((c) => c.centreId));

  return (
    <Card title="Examination centres">
      <ul className="space-y-3">
        {centres.map((c) => {
          const on = c.id in sel;
          return (
            <li key={c.id} className="text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[#1D4ED8]"
                  checked={on}
                  disabled={disabled || fixed.has(c.id)}
                  onChange={(e) =>
                    setSel((s) => {
                      const n = { ...s };
                      if (e.target.checked) n[c.id] = toLocalInput(paper.subject.examDate);
                      else delete n[c.id];
                      return n;
                    })
                  }
                />
                <span><span className="font-medium">{c.code}</span> — {c.name}<span className="block text-xs text-muted">{c.city}</span></span>
              </label>
              {on && (
                <input
                  type="datetime-local"
                  aria-label={`Unlock time for ${c.code}`}
                  className="input mt-1.5 text-xs"
                  value={sel[c.id]}
                  disabled={disabled || fixed.has(c.id)}
                  onChange={(e) => setSel((s) => ({ ...s, [c.id]: e.target.value }))}
                />
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">Each centre can download only from its unlock time (defaults to the exam date/time).</p>
      <button
        className="btn-secondary btn-sm mt-3"
        disabled={disabled}
        onClick={() => onSave(Object.entries(sel).map(([centreId, v]) => ({ centreId, availableFrom: new Date(v).toISOString() })))}
      >
        Save centres
      </button>
    </Card>
  );
}
