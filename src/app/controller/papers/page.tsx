"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";
import { fmtDateTime, qs, useApi } from "@/lib/client";
import { PAPER_STATUSES, STATUS_LABEL } from "@/lib/constants";
import { Alert, Card, Empty, PageHeader, Pill, SemesterFilter, Spinner, StatusBadge, Table } from "@/components/ui";

type Row = {
  id: string; status: string; isLate: boolean; revisionCount: number; releasedAsModel: boolean;
  subject: { code: string; title: string; semester: string; examType: string; examDate: string; submissionDeadline: string };
  setter: { name: string }; typist: { name: string } | null; centres: { code: string; downloadCount: number }[];
};

function PapersList() {
  const sp = useSearchParams();
  const [semester, setSemester] = useState(sp.get("semester") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [q, setQ] = useState("");
  const { data, error, loading } = useApi<{ papers: Row[]; semesters: string[]; currentSemester: string }>(`/api/controller/papers${qs({ semester, status })}`);
  const papers = (data?.papers ?? []).filter((p) => !q || `${p.subject.code} ${p.subject.title} ${p.setter.name}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Papers"
        description="All papers across the lifecycle. Archived papers are visible only here."
        actions={<Link className="btn-primary" href="/controller/subjects">New subject</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SemesterFilter semesters={data?.semesters ?? []} value={semester} onChange={setSemester} current={data?.currentSemester} />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Status</span>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {PAPER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <input className="input w-full sm:ml-auto sm:w-64" placeholder="Search code, title, setter…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <Alert>{error}</Alert>}
      <Card bodyClass="p-0">
        {loading ? (
          <div className="px-5"><Spinner /></div>
        ) : papers.length === 0 ? (
          <Empty icon={<FileText className="h-8 w-8" />} title="No papers match these filters">Papers are created when you assign a setter to a subject.</Empty>
        ) : (
          <Table>
            <thead className="bg-[#F8FAFC]">
              <tr><th className="th">Subject</th><th className="th">Setter</th><th className="th">Typist</th><th className="th">Exam</th><th className="th">Centres</th><th className="th">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {papers.map((p) => (
                <tr key={p.id} className="hover:bg-[#F8FAFC]">
                  <td className="td">
                    <Link href={`/controller/papers/${p.id}`} className="font-medium text-[#1D4ED8] hover:underline">{p.subject.code}</Link>
                    <p className="text-muted">{p.subject.title}</p>
                    <p className="text-xs text-muted">{p.subject.examType} · {p.subject.semester}</p>
                  </td>
                  <td className="td">{p.setter.name}{p.isLate && <div className="mt-1"><Pill tone="amber">Late</Pill></div>}</td>
                  <td className="td">{p.typist?.name ?? <span className="text-muted">—</span>}</td>
                  <td className="td whitespace-nowrap">{fmtDateTime(p.subject.examDate)}</td>
                  <td className="td">{p.centres.length ? p.centres.map((c) => c.code).join(", ") : <span className="text-muted">—</span>}</td>
                  <td className="td">
                    <StatusBadge status={p.status} />
                    {p.releasedAsModel && <div className="mt-1"><Pill tone="green">Model</Pill></div>}
                    {p.revisionCount > 0 && <p className="mt-1 text-xs text-muted">{p.revisionCount} rev.</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

export default function Page() {
  return <Suspense><PapersList /></Suspense>;
}
