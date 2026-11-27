"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Download, Eye, Lock, Unlock } from "lucide-react";
import { fmtDateTime, useApi } from "@/lib/client";
import { Alert, Card, Empty, PageHeader, Pill, Spinner, Stat, StatusBadge } from "@/components/ui";
import { formatRemaining, useNow } from "@/components/Countdown";

type Assignment = {
  paperId: string;
  subject: { code: string; title: string; semester: string; examType: string };
  examDate: string; availableFrom: string; durationMinutes: number | null; totalMarks: number | null;
  unlocked: boolean; downloadCount: number; firstAccessAt?: string | null; firstDownloadAt: string | null; status: string;
};
type Data = { centre: { code: string; name: string; city: string }; serverNow: string; papers: Assignment[] };

// FR-18: download buttons stay locked with a live countdown until the scheduled time.
export default function CentreDashboard() {
  const { data, error, loading, reload } = useApi<Data>("/api/centre/papers");
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  useEffect(() => { if (data) setFetchedAt(Date.now()); }, [data]);
  const offset = useMemo(() => (data ? new Date(data.serverNow).getTime() - fetchedAt : 0), [data, fetchedAt]);
  const now = useNow(offset);
  const [semester, setSemester] = useState("");

  const papers = (data?.papers ?? []).filter((p) => !semester || p.subject.semester === semester);
  const semesters = Array.from(new Set((data?.papers ?? []).map((p) => p.subject.semester)));
  const upcoming = papers.filter((p) => new Date(p.availableFrom).getTime() > now);
  const open = papers.filter((p) => new Date(p.availableFrom).getTime() <= now);

  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Examination Papers"
        description={data ? `${data.centre.code} — ${data.centre.name}, ${data.centre.city}` : undefined}
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Semester</span>
            <select className="input w-auto" value={semester} onChange={(e) => setSemester(e.target.value)}>
              <option value="">All</option>
              {semesters.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        }
      />
      {error && <Alert>{error}</Alert>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Scheduled" value={papers.length} />
        <Stat label="Upcoming" value={upcoming.length} hint={upcoming[0] ? `Next: ${upcoming[0].subject.code}, ${fmtDateTime(upcoming[0].availableFrom)}` : undefined} />
        <Stat label="Available now" value={open.filter((p) => p.status !== "USED").length} tone={open.some((p) => p.status !== "USED") ? "amber" : undefined} />
        <Stat label="Used" value={papers.filter((p) => p.status === "USED").length} />
      </div>
      <div className="mb-4">
        <Alert tone="info">Papers unlock automatically at their scheduled unlock time, shortly before the exam starts (server clock). Every access and download is logged with time and centre identity.</Alert>
      </div>
      {papers.length === 0 ? (
        <Card><Empty icon={<CalendarClock className="h-8 w-8" />} title="No papers scheduled for your centre" /></Card>
      ) : (
        <div className="space-y-8">
          {open.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Unlocked</h2>
              <div className="grid gap-4 md:grid-cols-2">{open.map((p) => <PaperCard key={p.paperId} p={p} now={now} onOpen={reload} />)}</div>
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Upcoming (time-locked)</h2>
              <div className="grid gap-4 md:grid-cols-2">{upcoming.map((p) => <PaperCard key={p.paperId} p={p} now={now} onOpen={reload} />)}</div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function PaperCard({ p, now, onOpen }: { p: Assignment; now: number; onOpen: () => void }) {
  const remaining = new Date(p.availableFrom).getTime() - now;
  const locked = remaining > 0;
  const after = () => setTimeout(onOpen, 1500);
  return (
    <div className={`card p-5 ${locked ? "" : "ring-1 ring-emerald-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{p.subject.code}</p>
          <p className="text-sm text-muted">{p.subject.title}</p>
          <p className="mt-1 text-xs text-muted">{p.subject.examType} · {p.subject.semester}{p.durationMinutes ? ` · ${p.durationMinutes} min` : ""}{p.totalMarks ? ` · ${p.totalMarks} marks` : ""}</p>
        </div>
        {p.status === "USED" ? <StatusBadge status="USED" /> : locked ? <Pill><Lock className="h-3 w-3" /> Locked</Pill> : <Pill tone="green"><Unlock className="h-3 w-3" /> Unlocked</Pill>}
      </div>
      <div className="mt-4 rounded-md bg-[#F8FAFC] px-4 py-3">
        <p className="text-xs text-muted">Exam starts</p>
        <p className="text-sm font-medium">{fmtDateTime(p.examDate)}</p>
        <p className="mt-2 text-xs text-muted">{locked ? "Unlocks at" : "Unlocked at"}</p>
        <p className="text-sm font-medium">{fmtDateTime(p.availableFrom)}</p>
        {locked && (
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink" aria-live="polite">
            {formatRemaining(remaining)}
          </p>
        )}
        {p.firstAccessAt && !p.firstDownloadAt && <p className="mt-1 text-xs text-muted">First opened {fmtDateTime(p.firstAccessAt)}</p>}
        {p.firstDownloadAt && <p className="mt-1 text-xs text-muted">First downloaded {fmtDateTime(p.firstDownloadAt)} · {p.downloadCount} download(s)</p>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {locked ? (
          <button className="btn-locked" disabled aria-disabled>
            <Lock className="h-4 w-4" /> Download locked
          </button>
        ) : (
          <>
            <a className="btn-primary" href={`/api/centre/papers/${p.paperId}/download`} onClick={after}>
              <Download className="h-4 w-4" /> Download paper
            </a>
            <a className="btn-secondary" href={`/api/centre/papers/${p.paperId}/download?mode=view`} target="_blank" rel="noopener" onClick={after}>
              <Eye className="h-4 w-4" /> Open
            </a>
          </>
        )}
      </div>
    </div>
  );
}
