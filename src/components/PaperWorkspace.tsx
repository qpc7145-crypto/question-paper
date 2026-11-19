"use client";
import { useEffect, useRef, useState } from "react";
import { Eye, FileUp, LayoutList, Loader2, Save, Type, Upload } from "lucide-react";
import { RichEditor } from "@/components/RichEditor";
import { Alert, Card, Field } from "@/components/ui";
import { api, fmtBytes } from "@/lib/client";

export type PaperContent = {
  status: string;
  format: string;
  mode: string;
  contentHtml?: string;
  sectionAHtml?: string;
  sectionBHtml?: string;
  sectionCHtml?: string;
  instructions: string;
  totalMarks: number | null;
  durationMinutes: number | null;
  file: { name: string; sizeBytes: number } | null;
};

type Props<P> = {
  paper: P & PaperContent;
  editable: boolean;
  saveUrl: string;
  uploadUrl: string;
  previewUrl: string;
  revisionNote?: boolean; // Controller / Typist modifications record a note
  saveLabel?: string;
  onSaved: (paper: P & PaperContent) => void;
  actions?: React.ReactNode;
  dirtyRef?: React.MutableRefObject<boolean>;
};

export function PaperWorkspace<P>({ paper, editable, saveUrl, uploadUrl, previewUrl, revisionNote, saveLabel = "Save draft", onSaved, actions, dirtyRef }: Props<P>) {
  const [format, setFormat] = useState(paper.format);
  const [mode, setMode] = useState(paper.mode);
  const [html, setHtml] = useState({
    contentHtml: paper.contentHtml ?? "",
    sectionAHtml: paper.sectionAHtml ?? "",
    sectionBHtml: paper.sectionBHtml ?? "",
    sectionCHtml: paper.sectionCHtml ?? "",
  });
  const [instructions, setInstructions] = useState(paper.instructions);
  const [totalMarks, setTotalMarks] = useState(paper.totalMarks?.toString() ?? "");
  const [duration, setDuration] = useState(paper.durationMinutes?.toString() ?? "");
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "upload" | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const touch = () => setDirty(true);
  useEffect(() => {
    if (dirtyRef) dirtyRef.current = dirty;
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, dirtyRef]);

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      const r = await api<{ paper: P & PaperContent }>(saveUrl, {
        method: "PATCH",
        json: {
          format, mode, ...html, instructions,
          totalMarks: totalMarks ? Number(totalMarks) : null,
          durationMinutes: duration ? Number(duration) : null,
          ...(revisionNote && { note }),
        },
      });
      setDirty(false);
      setNote("");
      setMsg({ tone: "success", text: "Saved" });
      onSaved(r.paper);
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setBusy("upload");
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api<{ paper: P & PaperContent }>(uploadUrl, { method: "POST", body: fd });
      setFormat("FILE");
      setMsg({ tone: "success", text: "File uploaded" });
      onSaved(r.paper);
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const seg = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-all duration-150 ${active ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`;

  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <Card bodyClass="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md bg-[#F1F5F9] p-1" role="group" aria-label="Paper format">
            <button type="button" disabled={!editable} className={seg(format === "RICH_TEXT")} onClick={() => { setFormat("RICH_TEXT"); touch(); }}>
              <Type className="h-4 w-4" /> Rich text
            </button>
            <button type="button" disabled={!editable} className={seg(format === "FILE")} onClick={() => { setFormat("FILE"); touch(); }}>
              <FileUp className="h-4 w-4" /> PDF / Word file
            </button>
          </div>
          {format === "RICH_TEXT" && (
            <div className="inline-flex rounded-md bg-[#F1F5F9] p-1" role="group" aria-label="Layout mode">
              <button type="button" disabled={!editable} className={seg(mode === "FREE")} onClick={() => { setMode("FREE"); touch(); }}>
                Free format
              </button>
              <button type="button" disabled={!editable} className={seg(mode === "STRUCTURED")} onClick={() => { setMode("STRUCTURED"); touch(); }}>
                <LayoutList className="h-4 w-4" /> Sections A / B / C
              </button>
            </div>
          )}
          <a href={previewUrl} target="_blank" rel="noopener" className="btn-secondary btn-sm ml-auto">
            <Eye className="h-3.5 w-3.5" /> Preview
          </a>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_9rem_9rem]">
          <Field label="Instructions to candidates">
            <textarea className="input min-h-[2.5rem]" rows={2} disabled={!editable} value={instructions} onChange={(e) => { setInstructions(e.target.value); touch(); }} />
          </Field>
          <Field label="Total marks">
            <input className="input" type="number" min={0} disabled={!editable} value={totalMarks} onChange={(e) => { setTotalMarks(e.target.value); touch(); }} />
          </Field>
          <Field label="Duration (min)">
            <input className="input" type="number" min={0} disabled={!editable} value={duration} onChange={(e) => { setDuration(e.target.value); touch(); }} />
          </Field>
        </div>
      </Card>

      {format === "FILE" ? (
        <Card title="Paper file">
          {paper.file ? (
            <p className="text-sm">
              Current file: <span className="font-medium">{paper.file.name}</span> <span className="text-muted">({fmtBytes(paper.file.sizeBytes)})</span>
            </p>
          ) : (
            <p className="text-sm text-muted">No file uploaded yet.</p>
          )}
          {editable && (
            <div className="mt-3">
              <input ref={fileInput} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
                {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {paper.file ? "Replace file" : "Upload PDF / Word"}
              </button>
              <p className="mt-2 text-xs text-muted">PDF, DOC or DOCX. Remove your name from the document and its properties before uploading.</p>
            </div>
          )}
        </Card>
      ) : mode === "STRUCTURED" ? (
        (["sectionAHtml", "sectionBHtml", "sectionCHtml"] as const).map((k, i) => (
          <Card key={k} title={`Section ${"ABC"[i]}`} bodyClass="p-3">
            <RichEditor
              value={html[k]}
              editable={editable}
              placeholder={`Questions for Section ${"ABC"[i]}…`}
              onChange={(v) => { setHtml((h) => ({ ...h, [k]: v })); touch(); }}
            />
          </Card>
        ))
      ) : (
        <Card title="Question paper" bodyClass="p-3">
          <RichEditor value={html.contentHtml} editable={editable} onChange={(v) => { setHtml((h) => ({ ...h, contentHtml: v })); touch(); }} />
        </Card>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        {editable && revisionNote && (
          <input className="input max-w-sm flex-1" placeholder="Revision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        )}
        {editable && (
          <button type="button" className="btn-secondary" onClick={save} disabled={busy !== null || !dirty}>
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saveLabel}
          </button>
        )}
        {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
        <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
      </div>
    </div>
  );
}
