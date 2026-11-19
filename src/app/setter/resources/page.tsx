"use client";
import { BookOpen, Download, FileText } from "lucide-react";
import { fmtBytes, fmtDate, useApi } from "@/lib/client";
import { Alert, Card, Empty, PageHeader, Spinner } from "@/components/ui";

type Res = { id: string; title: string; semester: string | null; subject: { code: string; title: string } | null; sizeBytes: number; createdAt: string };
type Released = { paperId: string; code: string; title: string; semester: string; examType: string };

export default function SetterResourcesPage() {
  const { data, error, loading } = useApi<{ syllabi: Res[]; modelPapers: Res[]; releasedPapers: Released[] }>("/api/setter/resources");

  const list = (items: Res[], empty: string) =>
    items.length === 0 ? (
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

  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="Syllabus & Model Papers" description="Reference material from the Examinations Office. Available before and after submission." />
      {error && <Alert>{error}</Alert>}
      <div className="space-y-6">
        <Card title="Syllabus & guidelines" bodyClass="p-0">{list(data?.syllabi ?? [], "No syllabus uploaded yet")}</Card>
        <Card title="Model papers" bodyClass="p-0">
          {list(data?.modelPapers ?? [], "No model papers uploaded")}
        </Card>
        <Card title="Past examination papers released for reference" bodyClass="p-0">
          {(data?.releasedPapers ?? []).length === 0 ? (
            <Empty icon={<BookOpen className="h-8 w-8" />} title="No past papers released yet" />
          ) : (
            <ul className="divide-y divide-line">
              {data!.releasedPapers.map((p) => (
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
