"use client";
import { Fragment, useState } from "react";
import { FileSpreadsheet, FileText, ShieldCheck, ShieldX } from "lucide-react";
import { api, fmtDateTime, qs, useApi } from "@/lib/client";
import { Alert, Card, Empty, Field, PageHeader, Spinner, Table } from "@/components/ui";

type Log = { seq: number; at: string; userEmail: string | null; role: string | null; action: string; entity: string | null; entityId: string | null; entityLabel?: string | null; details: string; ip: string | null; hash: string };
type Data = { total: number; page: number; pageSize: number; rows: Log[]; actions: string[] };
const EMPTY = { email: "", role: "", action: "", from: "", to: "" };

// FR-25 / FR-26: read-only, filterable, exportable, tamper-evident audit log.
export default function AuditPage() {
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<Data>(`/api/controller/audit${qs({ ...filters, page })}`);
  const [verify, setVerify] = useState<{ valid: boolean; total: number; brokenAtSeq: number | null } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Append-only, hash-chained record of every action. Entries cannot be edited or deleted."
        actions={
          <>
            <button className="btn-secondary btn-sm" onClick={async () => setVerify(await api("/api/controller/audit/verify"))}><ShieldCheck className="h-3.5 w-3.5" /> Verify integrity</button>
            <a className="btn-secondary btn-sm" href={`/api/controller/export${qs({ report: "audit", format: "pdf", ...filters })}`}><FileText className="h-3.5 w-3.5" /> Export PDF</a>
            <a className="btn-primary btn-sm" href={`/api/controller/export${qs({ report: "audit", format: "xlsx", ...filters })}`}><FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel</a>
          </>
        }
      />
      {verify && (
        <div className="mb-4">
          {verify.valid ? (
            <Alert tone="success">Chain intact — all {verify.total} entries verified.</Alert>
          ) : (
            <Alert><span className="inline-flex items-center gap-1.5"><ShieldX className="h-4 w-4" /> Tampering detected at entry #{verify.brokenAtSeq}.</span></Alert>
          )}
        </div>
      )}
      <Card className="mb-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setFilters(draft); }}
        >
          <Field label="User email"><input className="input" value={draft.email} onChange={set("email")} /></Field>
          <Field label="Role">
            <select className="input" value={draft.role} onChange={set("role")}>
              <option value="">Any</option>
              {["CONTROLLER", "SETTER", "TYPIST", "SUPERINTENDENT"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Action">
            <select className="input" value={draft.action} onChange={set("action")}>
              <option value="">Any</option>
              {(data?.actions ?? []).map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="From"><input className="input" type="date" value={draft.from} max={draft.to || undefined} onChange={set("from")} /></Field>
          <Field label="To"><input className="input" type="date" value={draft.to} min={draft.from || undefined} onChange={set("to")} /></Field>
          <div className="flex items-end gap-2">
            <button className="btn-primary flex-1">Filter</button>
            <button type="button" className="btn-secondary" onClick={() => { setDraft(EMPTY); setFilters(EMPTY); setPage(1); }}>Reset</button>
          </div>
        </form>
      </Card>
      {error && <Alert>{error}</Alert>}
      <Card bodyClass="p-0">
        {loading && !data ? <div className="px-5"><Spinner /></div> : (data?.rows ?? []).length === 0 ? <Empty title="No log entries match" /> : (
          <>
            <Table>
              <thead className="bg-[#F8FAFC]"><tr><th className="th">#</th><th className="th">Time</th><th className="th">Action</th><th className="th">User</th><th className="th">Entity</th><th className="th">IP</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data!.rows.map((l) => (
                  <Fragment key={l.seq}>
                    <tr className="cursor-pointer hover:bg-[#F8FAFC]" onClick={() => setOpen(open === l.seq ? null : l.seq)}>
                      <td className="td font-mono text-xs text-muted">{l.seq}</td>
                      <td className="td whitespace-nowrap">{fmtDateTime(l.at)}</td>
                      <td className="td"><span className={`font-mono text-xs font-medium ${/FAILED/.test(l.action) ? "text-red-600" : ""}`}>{l.action}</span></td>
                      <td className="td">{l.userEmail ?? <span className="text-muted">system / anonymous</span>}<p className="text-xs text-muted">{l.role}</p></td>
                      <td className="td text-xs">{l.entity}{l.entityLabel ? <p className="font-medium">{l.entityLabel}</p> : l.entityId && <p className="font-mono text-muted">{l.entityId.slice(0, 12)}</p>}</td>
                      <td className="td font-mono text-xs">{l.ip ?? "—"}</td>
                    </tr>
                    {open === l.seq && (
                      <tr className="bg-[#F8FAFC]">
                        <td colSpan={6} className="px-4 py-3">
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">{JSON.stringify(JSON.parse(l.details || "{}"), null, 2)}</pre>
                          <p className="mt-2 break-all font-mono text-[11px] text-muted">hash {l.hash}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
              <span className="text-muted">{data!.total} entries</span>
              <div className="flex items-center gap-2">
                <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <span className="tabular-nums">{page} / {pages}</span>
                <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
