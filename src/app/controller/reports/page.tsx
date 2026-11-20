"use client";
import Link from "next/link";
import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { fmtDateTime, qs, useApi } from "@/lib/client";
import { Alert, Card, Empty, PageHeader, Pill, SemesterFilter, Spinner, Table } from "@/components/ui";

type SetterRow = { setterId: string; name: string; email: string; institution: string; assigned: number; papersSet: number; lateSubmissions: number; overdueDrafts: number; revisionCount: number; onTimeRate: number | null };
type CentreRow = {
  centreId: string; code: string; name: string; city: string; assignedPapers: number; downloadedPapers: number; totalDownloads: number;
  rows: { subject: string; semester: string; examType: string; scheduledAt: string; firstAccessAt: string | null; firstDownloadAt: string | null; downloadCount: number; delayMinutes: number | null }[];
};

export default function ReportsPage() {
  const [tab, setTab] = useState<"setters" | "centres">("setters");
  const [semester, setSemester] = useState("");
  const { data, error, loading } = useApi<{ rows: SetterRow[] | CentreRow[]; semesters: string[] }>(`/api/controller/reports${qs({ type: tab, semester })}`);

  const exportLinks = (
    <>
      <a className="btn-secondary btn-sm" href={`/api/controller/export${qs({ report: tab, format: "pdf", semester })}`}><FileText className="h-3.5 w-3.5" /> Export PDF</a>
      <a className="btn-secondary btn-sm" href={`/api/controller/export${qs({ report: tab, format: "xlsx", semester })}`}><FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel</a>
    </>
  );
  const tabCls = (on: boolean) => `border-b-2 px-1 pb-2 text-sm font-medium transition-all duration-150 ${on ? "border-[#1D4ED8] text-ink" : "border-transparent text-muted hover:text-ink"}`;

  return (
    <>
      <PageHeader title="Reports" actions={<SemesterFilter semesters={data?.semesters ?? []} value={semester} onChange={setSemester} />} />
      <div className="mb-4 flex gap-6 border-b border-line" role="tablist">
        <button role="tab" aria-selected={tab === "setters"} className={tabCls(tab === "setters")} onClick={() => setTab("setters")}>Setter performance</button>
        <button role="tab" aria-selected={tab === "centres"} className={tabCls(tab === "centres")} onClick={() => setTab("centres")}>Centre usage</button>
        <Link href="/controller/audit" className={tabCls(false)}>Audit log →</Link>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading ? <Spinner /> : tab === "setters" ? (
        <Card title="Setter performance" actions={<div className="flex gap-2">{exportLinks}</div>} bodyClass="p-0">
          {((data?.rows ?? []) as SetterRow[]).length === 0 ? <Empty title="No setters" /> : (
            <Table>
              <thead className="bg-[#F8FAFC]">
                <tr><th className="th">Setter</th><th className="th text-right">Assigned</th><th className="th text-right">Papers set</th><th className="th text-right">Late</th><th className="th text-right">Overdue drafts</th><th className="th text-right">Revisions</th><th className="th text-right">On-time</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {((data?.rows ?? []) as SetterRow[]).map((r) => (
                  <tr key={r.setterId}>
                    <td className="td"><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.institution || r.email}</p></td>
                    <td className="td text-right tabular-nums">{r.assigned}</td>
                    <td className="td text-right tabular-nums">{r.papersSet}</td>
                    <td className="td text-right tabular-nums">{r.lateSubmissions ? <Pill tone="amber">{r.lateSubmissions}</Pill> : 0}</td>
                    <td className="td text-right tabular-nums">{r.overdueDrafts ? <Pill tone="red">{r.overdueDrafts}</Pill> : 0}</td>
                    <td className="td text-right tabular-nums">{r.revisionCount}</td>
                    <td className="td text-right tabular-nums">{r.onTimeRate === null ? "—" : `${r.onTimeRate}%`}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">{exportLinks}</div>
          {((data?.rows ?? []) as CentreRow[]).map((c) => (
            <Card key={c.centreId} title={`${c.code} — ${c.name}`} actions={<span className="text-xs text-muted">{c.downloadedPapers}/{c.assignedPapers} papers downloaded · {c.totalDownloads} downloads</span>} bodyClass="p-0">
              {(c.rows ?? []).length === 0 ? <Empty title="No papers assigned in this period" /> : (
                <Table>
                  <thead className="bg-[#F8FAFC]"><tr><th className="th">Paper</th><th className="th">Scheduled</th><th className="th">First access</th><th className="th">First download</th><th className="th text-right">Downloads</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {c.rows.map((r, i) => (
                      <tr key={i}>
                        <td className="td"><p className="font-medium">{r.subject}</p><p className="text-xs text-muted">{r.examType} · {r.semester}</p></td>
                        <td className="td whitespace-nowrap">{fmtDateTime(r.scheduledAt)}</td>
                        <td className="td whitespace-nowrap">{fmtDateTime(r.firstAccessAt)}</td>
                        <td className="td whitespace-nowrap">{fmtDateTime(r.firstDownloadAt)}{r.delayMinutes !== null && <p className="text-xs text-muted">+{r.delayMinutes} min after unlock</p>}</td>
                        <td className="td text-right tabular-nums">{r.downloadCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
