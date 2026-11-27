"use client";
import Link from "next/link";
import { useState } from "react";
import { FileText, Send } from "lucide-react";
import { fmtDateTime, qs, useApi } from "@/lib/client";
import { Alert, Card, Empty, PageHeader, Pill, SemesterFilter, Spinner, Stat, StatusBadge, Table } from "@/components/ui";

type Row = {
  id: string; status: string; canSend: boolean; revisionCount: number; editable: boolean;
  subject: { code: string; title: string; semester: string; examType: string; examDate: string };
  centres: { code: string }[];
};

// Setter identity is never part of this payload (FR-14).
export default function TypistDashboard() {
  const [semester, setSemester] = useState("");
  const { data, error, loading } = useApi<{ papers: Row[]; semesters: string[] }>(`/api/typist/papers${qs({ semester })}`);
  const papers = data?.papers ?? [];
  return (
    <>
      <PageHeader
        title="Assigned Papers"
        description="Papers nominated to you by the Controller for typing and modification."
        actions={<SemesterFilter semesters={data?.semesters ?? []} value={semester} onChange={setSemester} />}
      />
      {error && <Alert>{error}</Alert>}
      {!loading && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Assigned" value={papers.length} />
          <Stat label="To modify" value={papers.filter((p) => p.editable).length} tone={papers.some((p) => p.editable) ? "amber" : undefined} />
          <Stat label="Delegated to send" value={papers.filter((p) => p.canSend).length} />
          <Stat label="Sent / used" value={papers.filter((p) => p.status === "SENT_TO_CENTRE" || p.status === "USED").length} />
        </div>
      )}
      <Card bodyClass="p-0">
        {loading ? (
          <div className="px-5"><Spinner /></div>
        ) : papers.length === 0 ? (
          <Empty icon={<FileText className="h-8 w-8" />} title="No papers assigned to you" />
        ) : (
          <Table>
            <thead className="bg-[#F8FAFC]">
              <tr><th className="th">Subject</th><th className="th">Exam</th><th className="th">Centres</th><th className="th">Status</th><th className="th" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {papers.map((p) => (
                <tr key={p.id} className="hover:bg-[#F8FAFC]">
                  <td className="td"><p className="font-medium">{p.subject.code}</p><p className="text-muted">{p.subject.title}</p></td>
                  <td className="td">{p.subject.examType} · {p.subject.semester}<p className="text-muted">{fmtDateTime(p.subject.examDate)}</p></td>
                  <td className="td">
                    {p.centres.length ? p.centres.map((c) => c.code).join(", ") : <span className="text-muted">—</span>}
                    {p.canSend && <div className="mt-1"><Pill tone="blue"><Send className="h-3 w-3" /> Delegated to send</Pill></div>}
                  </td>
                  <td className="td"><StatusBadge status={p.status} />{p.revisionCount > 0 && <p className="mt-1 text-xs text-muted">{p.revisionCount} revision(s)</p>}</td>
                  <td className="td text-right">
                    {p.status === "DRAFT" ? (
                      <span className="btn-locked btn-sm">Awaiting setter</span>
                    ) : (
                      <Link href={`/typist/papers/${p.id}`} className={p.editable ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{p.editable ? "Open" : "View"}</Link>
                    )}
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
