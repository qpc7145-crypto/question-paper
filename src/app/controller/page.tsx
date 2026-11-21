"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, ScrollText } from "lucide-react";
import { fmtDateTime, qs, useApi } from "@/lib/client";
import { PAPER_STATUSES, ROLE_LABEL, type Role } from "@/lib/constants";
import { Alert, Card, Empty, PageHeader, SemesterFilter, Spinner, Stat, StatusBadge } from "@/components/ui";

type Data = {
  counts: Record<string, number>;
  overdue: number;
  upcoming: { paperId: string; code: string; title: string; status: string; centre: string; availableFrom: string }[];
  users: Record<string, number>;
  centres: number;
  recent: { seq: number; at: string; action: string; userEmail: string | null; role: string | null }[];
  semesters: string[];
  currentSemester: string;
};

export default function ControllerDashboard() {
  const [semester, setSemester] = useState<string | null>(null);
  const { data, error, loading } = useApi<Data>(`/api/controller/dashboard${qs({ semester: semester ?? undefined })}`);
  // Default the filter to the current semester once known.
  useEffect(() => { if (semester === null && data?.currentSemester) setSemester(data.currentSemester); }, [data, semester]);

  return (
    <>
      <PageHeader
        title="Controller Dashboard"
        description={data?.currentSemester ? `Current semester: ${data.currentSemester}` : undefined}
        actions={<SemesterFilter semesters={data?.semesters ?? []} value={semester ?? ""} onChange={setSemester} current={data?.currentSemester} />}
      />
      {error && <Alert>{error}</Alert>}
      {loading && !data ? (
        <Spinner />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {PAPER_STATUSES.map((s) => (
              <Link key={s} href={`/controller/papers${qs({ status: s, semester: semester ?? undefined })}`} className="card p-4 transition-all duration-150 hover:border-[#CBD5E1] hover:shadow-sm">
                <StatusBadge status={s} />
                <p className="mt-2 text-2xl font-semibold tabular-nums">{data.counts[s] ?? 0}</p>
              </Link>
            ))}
          </div>
          {data.overdue > 0 && (
            <Alert tone="warning">
              <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> {data.overdue} paper(s) past the submission deadline are still in draft.</span>{" "}
              <Link className="font-medium underline" href="/controller/reports">View setter performance</Link>
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(["SETTER", "TYPIST", "SUPERINTENDENT"] as Role[]).map((r) => <Stat key={r} label={ROLE_LABEL[r] + "s"} value={data.users[r] ?? 0} hint="active accounts" />)}
            <Stat label="Examination centres" value={data.centres} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={<span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Upcoming centre unlocks</span>} bodyClass="p-0">
              {data.upcoming.length === 0 ? (
                <Empty title="No upcoming exams" />
              ) : (
                <ul className="divide-y divide-line">
                  {data.upcoming.map((u, i) => (
                    <li key={i} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <Link href={`/controller/papers/${u.paperId}`} className="font-medium hover:underline">{u.code} — {u.title}</Link>
                        <p className="text-xs text-muted">{u.centre} · {fmtDateTime(u.availableFrom)}</p>
                      </div>
                      <StatusBadge status={u.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={<span className="inline-flex items-center gap-2"><ScrollText className="h-4 w-4" /> Recent activity</span>} bodyClass="p-0">
              <ul className="divide-y divide-line">
                {data.recent.map((r) => (
                  <li key={r.seq} className="px-5 py-2.5 text-sm">
                    <span className="font-mono text-xs text-muted">{fmtDateTime(r.at)}</span>
                    <p><span className="font-medium">{r.action.replace(/_/g, " ").toLowerCase()}</span> <span className="text-muted">· {r.userEmail ?? "system"}</span></p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
