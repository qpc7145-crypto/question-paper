"use client";
import Link from "next/link";
import { useState } from "react";
import { Clock, FileText } from "lucide-react";
import { fmtDateTime, qs, useApi } from "@/lib/client";
import { Alert, Card, Empty, PageHeader, Pill, SemesterFilter, Spinner, Stat, StatusBadge, Table } from "@/components/ui";

type Row = {
  id: string; status: string; isLate: boolean; submittedAt: string | null; editable: boolean;
  subject: { code: string; title: string; semester: string; examType: string; submissionDeadline: string };
};

export default function SetterDashboard() {
  const [semester, setSemester] = useState("");
  const { data, error, loading } = useApi<{ papers: Row[]; semesters: string[] }>(`/api/setter/papers${qs({ semester })}`);
  const now = Date.now();
  const papers = data?.papers ?? [];
  const drafts = papers.filter((p) => p.status === "DRAFT");
  const overdue = drafts.filter((p) => new Date(p.subject.submissionDeadline).getTime() < now);

  return (
    <>
      <PageHeader
        title="My Papers"
        description="Papers assigned to you by the Controller of Examination."
        actions={<SemesterFilter semesters={data?.semesters ?? []} value={semester} onChange={setSemester} />}
      />
      {error && <Alert>{error}</Alert>}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Assigned" value={papers.length} />
        <Stat label="Drafts" value={drafts.length} />
        <Stat label="Submitted" value={papers.length - drafts.length} />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "red" : undefined} />
      </div>
      <Card bodyClass="p-0">
        {loading ? (
          <div className="px-5"><Spinner /></div>
        ) : papers.length === 0 ? (
          <Empty icon={<FileText className="h-8 w-8" />} title="No papers assigned">You will see subjects here once the Controller assigns them to you.</Empty>
        ) : (
          <Table>
            <thead className="bg-[#F8FAFC]">
              <tr><th className="th">Subject</th><th className="th">Semester</th><th className="th">Deadline</th><th className="th">Status</th><th className="th" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {papers.map((p) => {
                const late = p.status === "DRAFT" && new Date(p.subject.submissionDeadline).getTime() < now;
                return (
                  <tr key={p.id} className="hover:bg-[#F8FAFC]">
                    <td className="td">
                      <p className="font-medium">{p.subject.code}</p>
                      <p className="text-muted">{p.subject.title} · {p.subject.examType}</p>
                    </td>
                    <td className="td">{p.subject.semester}</td>
                    <td className="td">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-muted" />{fmtDateTime(p.subject.submissionDeadline)}</span>
                      {late && <div className="mt-1"><Pill tone="red">Overdue</Pill></div>}
                      {p.isLate && <div className="mt-1"><Pill tone="amber">Submitted late</Pill></div>}
                    </td>
                    <td className="td"><StatusBadge status={p.status} /></td>
                    <td className="td text-right">
                      <Link href={`/setter/papers/${p.id}`} className={p.editable ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
                        {p.editable ? "Open editor" : "View"}
                      </Link>
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
