"use client";
import { useState } from "react";
import { BookOpen, Download, FileText } from "lucide-react";
import { fmtBytes, fmtDate, useApi } from "@/lib/client";
import { Alert, Card, Empty, PageHeader, SemesterFilter, Spinner } from "@/components/ui";
import { compareSemesters } from "@/lib/semesters";

type Res = { id: string; title: string; semester: string | null; subject: { code: string; title: string } | null; sizeBytes: number; createdAt: string };
type Released = { paperId: string; code: string; title: string; semester: string; examType: string };

export default function SetterResourcesPage() {
  const { data, error, loading } = useApi<{ syllabi: Res[]; modelPapers: Res[]; releasedPapers: Released[] }>("/api/setter/resources");

  const [semester, setSemester] = useState("");
  // Items with no semester (general guidelines) stay visible under every filter.
  const bySem = <T extends { semester: string | null }>(rows: T[]) => rows.filter((r) => !semester || !r.semester || r.semester === semester);
  const semesters = Array.from(new Set([...(data?.syllabi ?? []), ...(data?.modelPapers ?? []), ...(data?.releasedPapers ?? [])].map((r) => r.semester).filter((s): s is string => !!s))).sort(compareSemesters);
  const released = bySem(data?.releasedPapers ?? []);

  const list = (all: Res[], empty: string) => {
    const items = bySem(all);
    return items.length === 0 ? (
      <Empty title={empty} />
    ) : (
      <ul className="divide-y divide-line">
        {items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <FileText className="h-5 w-5 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.title}</p>
              <p className="text-xs text-muted">
                {r.subject ? `${r.subject.code} · ` : "General · "}{r.semester ?? "All semesters"} · {fmtBytes(r.sizeBytes)} · {fmtDate(r.createdAt)}
              </p>
            </div>
            <a className="btn-secondary btn-sm" href={`/api/resources/${r.id}/download`}><Download className="h-3.5 w-3.5" /> Download</a>
          </li>
        ))}
      </ul>
    );
  };

  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="Syllabus & Model Papers" description="Reference material from the Examinations Office. Available before and after submission." actions={<SemesterFilter semesters={semesters} value={semester} onChange={setSemester} />} />
      {error && <Alert>{error}</Alert>}
      <div className="space-y-6">
        <Card title="Syllabus & guidelines" bodyClass="p-0">{list(data?.syllabi ?? [], "No syllabus uploaded yet")}</Card>
        <Card title="Model papers" bodyClass="p-0">
          {list(data?.modelPapers ?? [], "No model papers uploaded")}
        </Card>
        <Card title="Past examination papers released for reference" bodyClass="p-0">
          {released.length === 0 ? (
            <Empty icon={<BookOpen className="h-8 w-8" />} title="No past papers released yet" />
          ) : (
            <ul className="divide-y divide-line">
              {released.map((p) => (
                <li key={p.paperId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <BookOpen className="h-5 w-5 text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.code} — {p.title}</p>
                    <p className="text-xs text-muted">{p.examType} · {p.semester}</p>
                  </div>
                  <a className="btn-secondary btn-sm" target="_blank" rel="noopener" href={`/api/setter/model-papers/${p.paperId}`}>Open</a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
