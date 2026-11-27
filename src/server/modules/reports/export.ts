import { prisma } from "@/server/core/db";
import { HttpError } from "@/server/core/http";
import { auditFilterFrom, auditStandalone, auditWhere } from "@/server/modules/audit/service";
import type { Actor } from "@/server/policy";
import { toPdf, toXlsx, type Column, type Row } from "./exporters";
import { centreUsage, setterPerformance } from "./service";

const fmt = (d: Date | null | undefined) => (d ? d.toISOString().replace("T", " ").slice(0, 19) + " UTC" : "");

// GET /api/controller/export?report=audit|setters|centres&format=pdf|xlsx&...filters
export async function buildExport(actor: Actor, sp: URLSearchParams) {
  const report = sp.get("report");
  const format = sp.get("format");
  const semester = sp.get("semester") || undefined;
  if (format !== "pdf" && format !== "xlsx") throw new HttpError(400, "format must be pdf or xlsx");

  let title: string;
  let columns: Column[];
  let rows: Row[];
  const filters: Record<string, string> = {};
  sp.forEach((v, k) => {
    if (!["report", "format"].includes(k) && v) filters[k] = v;
  });

  if (report === "audit") {
    title = "Audit Log Report";
    columns = [
      { key: "seq", header: "#", width: 6 },
      { key: "at", header: "Timestamp", width: 22 },
      { key: "action", header: "Action", width: 26 },
      { key: "userEmail", header: "User", width: 28 },
      { key: "role", header: "Role", width: 16 },
      { key: "entity", header: "Entity", width: 12 },
      { key: "entityId", header: "Entity ID", width: 24 },
      { key: "ip", header: "IP", width: 14 },
      { key: "details", header: "Details", width: 50 },
      { key: "hash", header: "Hash", width: 18 },
    ];
    const logs = await prisma.auditLog.findMany({ where: auditWhere(auditFilterFrom(sp)), orderBy: { seq: "asc" }, take: 20000 });
    rows = logs.map((l) => ({ ...l, at: fmt(l.at), hash: l.hash.slice(0, 16) }));
  } else if (report === "setters") {
    title = "Setter Performance Report";
    columns = [
      { key: "name", header: "Setter", width: 26 },
      { key: "email", header: "Email", width: 28 },
      { key: "institution", header: "Institution", width: 26 },
      { key: "assigned", header: "Assigned", width: 10 },
      { key: "papersSet", header: "Papers Set", width: 11 },
      { key: "lateSubmissions", header: "Late", width: 8 },
      { key: "overdueDrafts", header: "Overdue", width: 9 },
      { key: "revisionCount", header: "Revisions", width: 10 },
      { key: "onTimeRate", header: "On-time %", width: 10 },
      { key: "semesters", header: "Semesters", width: 22 },
    ];
    rows = await setterPerformance(semester);
  } else if (report === "centres") {
    title = "Centre Usage Report";
    columns = [
      { key: "centre", header: "Centre", width: 26 },
      { key: "subject", header: "Paper", width: 36 },
      { key: "semester", header: "Semester", width: 14 },
      { key: "examType", header: "Exam", width: 12 },
      { key: "scheduledAt", header: "Scheduled", width: 22 },
      { key: "firstAccessAt", header: "First Access", width: 22 },
      { key: "firstDownloadAt", header: "First Download", width: 22 },
      { key: "downloadCount", header: "Downloads", width: 10 },
    ];
    const data = await centreUsage(semester);
    rows = data.flatMap((c) =>
      c.rows.map((r) => ({
        centre: `${c.code} — ${c.name}`,
        subject: r.subject,
        semester: r.semester,
        examType: r.examType,
        scheduledAt: fmt(r.scheduledAt),
        firstAccessAt: fmt(r.firstAccessAt),
        firstDownloadAt: fmt(r.firstDownloadAt),
        downloadCount: r.downloadCount,
      })),
    );
  } else {
    throw new HttpError(400, "report must be audit, setters or centres");
  }

  const subtitle = `Generated ${fmt(new Date())} by ${actor.email}` +
    (Object.keys(filters).length ? ` · Filters: ${Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(", ")}` : "") +
    ` · ${rows.length} rows`;
  const file = format === "pdf" ? await toPdf(title, subtitle, columns, rows) : await toXlsx(title, columns, rows);

  await auditStandalone({ actor, action: "AUDIT_EXPORTED", details: { report, format, filters, rows: rows.length } });
  return {
    file,
    contentType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `${report}-report-${new Date().toISOString().slice(0, 10)}.${format}`,
  };
}
