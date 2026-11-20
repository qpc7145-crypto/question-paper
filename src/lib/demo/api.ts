// Frontend-only demo backend: answers the same URLs the real API serves, from in-memory sample data.
// It applies the same role, ownership and lifecycle rules as the real API routes, so the preview
// behaves like the product. Changes are kept in this browser (localStorage) so a flow can be
// followed across roles; "Reset sample data" on the sign-in page starts over.
import { AUDIT_ACTIONS, type Role } from "@/lib/constants";
import { SEMESTER_RE, compareSemesters, unlockTimeError } from "@/lib/semesters";
import { CURRENT_SEMESTER, CENTRES, INSTITUTION, PAPERS, RESOURCES, UNASSIGNED_SUBJECTS, USERS, AUDIT, centreById, userById, type DemoPaper } from "./data";

let currentSemester = CURRENT_SEMESTER;
let institutionName = INSTITUTION;
let idSeq = 1;
const newId = (p: string) => `${p}-new${idSeq++}`;
const now = () => new Date().toISOString();

type AccessEvent = { id: string; paperId: string; centreId: string; kind: "VIEW" | "DOWNLOAD"; at: string; ip: string };
const ACCESS: AccessEvent[] = [];

class DemoError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------- persistence
const STORE_KEY = "qpb-demo-state-v2";
const STORE_TTL = 8 * 60 * 60 * 1000; // same as a session

function replace<T>(target: T[], next: T[] | undefined) {
  if (next) target.splice(0, target.length, ...next);
}

function load() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    // Seed times are relative to page load. Save them on first use so every tab
    // (e.g. a centre's "Open" tab) sees the same unlock times.
    if (!raw) return save();
    const s = JSON.parse(raw);
    if (Date.now() - s.savedAt > STORE_TTL) {
      window.localStorage.removeItem(STORE_KEY);
      return save();
    }
    replace(PAPERS, s.papers); replace(USERS, s.users); replace(CENTRES, s.centres); replace(RESOURCES, s.resources);
    replace(UNASSIGNED_SUBJECTS, s.unassigned); replace(AUDIT, s.audit); replace(ACCESS, s.access);
    currentSemester = s.currentSemester ?? currentSemester;
    institutionName = s.institutionName ?? institutionName;
    idSeq = s.idSeq ?? idSeq;
  } catch {
    /* storage blocked or corrupt: fall back to the seeded data */
  }
}

function save() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({
      savedAt: Date.now(), papers: PAPERS, users: USERS, centres: CENTRES, resources: RESOURCES, unassigned: UNASSIGNED_SUBJECTS,
      audit: AUDIT, access: ACCESS, currentSemester, institutionName, idSeq,
    }));
  } catch {
    /* ignore */
  }
}

export function resetDemoData() {
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- who is asking
type Me = { id: string; role: Role; name: string };
let mePromise: Promise<Me> | null = null;
function whoAmI(): Promise<Me> {
  mePromise ??= fetch("/api/demo/me", { cache: "no-store" }).then(async (r) => {
    if (!r.ok) {
      mePromise = null;
      throw new DemoError(401, "Not signed in");
    }
    return r.json();
  });
  return mePromise;
}

const userEmail = (id: string) => userById(id)?.email ?? null;

function audit(me: Me, action: (typeof AUDIT_ACTIONS)[number], entity: string | null, entityId: string | null, details: Record<string, unknown> = {}) {
  const seq = (AUDIT[0]?.seq ?? 0) + 1;
  const hex = "0123456789abcdef";
  AUDIT.unshift({
    seq, at: now(), userEmail: userEmail(me.id), role: me.role, action, entity, entityId,
    details: JSON.stringify(details), ip: "10.0.4.21",
    hash: Array.from({ length: 64 }, () => hex[Math.floor(Math.random() * 16)]).join(""),
  });
}

// ---------------------------------------------------------------- lifecycle (mirrors src/lib/lifecycle.ts)
const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_MODIFICATION", "SENT_TO_CENTRE"],
  UNDER_MODIFICATION: ["SENT_TO_CENTRE"],
  SENT_TO_CENTRE: ["USED", "UNDER_MODIFICATION"],
  USED: ["ARCHIVED"],
  ARCHIVED: [],
};
function assertTransition(from: string, to: string) {
  if (!TRANSITIONS[from]?.includes(to)) throw new DemoError(409, `Paper cannot move from ${from} to ${to}`);
}
function assertEditable(role: Role, status: string) {
  if (status === "ARCHIVED") throw new DemoError(423, "Archived papers are permanently locked");
  if (status === "USED") throw new DemoError(423, "Paper is locked after use");
  const ok = role === "SETTER" ? status === "DRAFT" : status === "SUBMITTED" || status === "UNDER_MODIFICATION";
  if (!ok) throw new DemoError(409, `Paper is not editable while ${status}`);
}
const text = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
export function hasContent(p: DemoPaper) {
  if (p.format === "FILE") return !!p.file;
  return p.mode === "STRUCTURED" ? text(p.sectionAHtml) || text(p.sectionBHtml) || text(p.sectionCHtml) : text(p.contentHtml);
}

// ---------------------------------------------------------------- role views (mirror src/lib/serializers.ts)
const setterName = (p: DemoPaper) => userById(p.setterId)?.setterProfile?.fullName ?? userById(p.setterId)?.displayName ?? "—";
const bySemester = <T extends { subject: { semester: string } }>(rows: T[], s: string | null) => (s ? rows.filter((r) => r.subject.semester === s) : rows);
const allSubjects = () => [...PAPERS.map((p) => p.subject), ...UNASSIGNED_SUBJECTS];
const semesters = () => Array.from(new Set([currentSemester, ...allSubjects().map((s) => s.semester)])).sort(compareSemesters);

function content(p: DemoPaper) {
  return {
    format: p.format, mode: p.mode, contentHtml: p.contentHtml, sectionAHtml: p.sectionAHtml, sectionBHtml: p.sectionBHtml, sectionCHtml: p.sectionCHtml,
    instructions: p.instructions, totalMarks: p.totalMarks, durationMinutes: p.durationMinutes,
    // Original file name withheld from non-controllers: it can reveal who prepared it (FR-14).
    file: p.file ? { name: `${p.subject.code}-paper.${p.file.name.split(".").pop()}`, sizeBytes: p.file.sizeBytes } : null,
  };
}

function controllerView(p: DemoPaper) {
  const s = userById(p.setterId)!;
  const t = userById(p.typistId);
  return {
    id: p.id, status: p.status, subject: p.subject, ...content(p), file: p.file,
    setter: { id: s.id, email: s.email, name: setterName(p) },
    typist: t ? { id: t.id, email: t.email, name: t.displayName } : null,
    typistCanSend: p.typistCanSend,
    centres: p.centres.map((c) => {
      const x = centreById(c.centreId);
      return { ...c, code: x.code, name: x.name, city: x.city };
    }),
    revisionCount: p.revisions.length, submittedAt: p.submittedAt, isLate: p.isLate, sentAt: p.sentAt, usedAt: p.usedAt, archivedAt: p.archivedAt, releasedAsModel: p.releasedAsModel,
  };
}

const setterView = (p: DemoPaper) => ({
  id: p.id, status: p.status, subject: p.subject, ...content(p), submittedAt: p.submittedAt, isLate: p.isLate, editable: p.status === "DRAFT",
});

const typistView = (p: DemoPaper) => ({
  id: p.id, status: p.status, subject: p.subject, ...content(p), canSend: p.typistCanSend,
  centres: p.centres.map((c) => {
    const x = centreById(c.centreId);
    return { code: x.code, name: x.name, city: x.city, availableFrom: c.availableFrom };
  }),
  revisionCount: p.revisions.length, submittedAt: p.submittedAt, sentAt: p.sentAt, editable: p.status === "SUBMITTED" || p.status === "UNDER_MODIFICATION",
});

function paper(id: string) {
  const p = PAPERS.find((x) => x.id === id);
  if (!p) throw new DemoError(404, "Paper not found");
  return p;
}

// Same visibility rules as the real routes: anything else is "not found", never "forbidden",
// so a restricted role can't even learn that a paper ID exists.
function setterPaper(id: string, me: Me) {
  const p = paper(id);
  if (p.setterId !== me.id || p.status === "ARCHIVED") throw new DemoError(404, "Paper not found");
  return p;
}
function typistPaper(id: string, me: Me) {
  const p = paper(id);
  if (p.typistId !== me.id || p.status === "ARCHIVED" || p.status === "DRAFT") throw new DemoError(404, "Paper not found");
  return p;
}
const myCentre = (me: Me) => CENTRES.find((x) => x.supId === me.id) ?? null;

function applyEdit(p: DemoPaper, b: Record<string, unknown>, me: Me) {
  assertEditable(me.role, p.status);
  for (const k of ["format", "mode", "contentHtml", "sectionAHtml", "sectionBHtml", "sectionCHtml", "instructions", "totalMarks", "durationMinutes"] as const) {
    if (k in b) (p as Record<string, unknown>)[k] = b[k];
  }
  const modification = me.role !== "SETTER";
  if (modification) {
    p.revisions.unshift({ id: newId("r"), editorRole: me.role, editorName: me.name, note: String(b.note ?? ""), createdAt: now() });
    p.status = "UNDER_MODIFICATION";
  }
  audit(me, modification ? "PAPER_EDITED" : "PAPER_DRAFT_SAVED", "Paper", p.id, { subject: p.subject.code, note: b.note });
}

function sendToCentres(p: DemoPaper, me: Me) {
  if (me.role === "TYPIST" && (p.typistId !== me.id || !p.typistCanSend)) throw new DemoError(403, "You are not delegated to send this paper");
  if (p.status !== "SUBMITTED" && p.status !== "UNDER_MODIFICATION") throw new DemoError(409, `Paper cannot be sent while ${p.status}`);
  if (!hasContent(p)) throw new DemoError(400, "Paper has no content");
  if (p.centres.length === 0) throw new DemoError(400, "Assign at least one centre before sending");
  p.status = "SENT_TO_CENTRE";
  p.sentAt = now();
  audit(me, "PAPER_SENT_TO_CENTRE", "Paper", p.id, { subject: p.subject.code, centres: p.centres.map((c) => centreById(c.centreId).code) });
}

const EXAM_TYPES = ["MIDTERM", "FINAL", "SUPPLEMENTARY", "SPECIAL"];

function setterIsAssignable(id: string) {
  const s = userById(id);
  if (!s || s.role !== "SETTER" || !s.isActive) throw new DemoError(400, "Selected setter is not an active Paper Setter");
  if (!s.setterProfile) throw new DemoError(409, "This setter has not completed their bio-data yet and cannot be assigned a subject (FR-4)");
}

const newPaper = (subject: DemoPaper["subject"], setterId: string): DemoPaper => ({
  id: newId("p"), status: "DRAFT", subject, setterId, typistId: null, typistCanSend: false, format: "RICH_TEXT", mode: "FREE",
  contentHtml: "", sectionAHtml: "", sectionBHtml: "", sectionCHtml: "", instructions: "", totalMarks: null, durationMinutes: null, file: null,
  centres: [], revisions: [], submittedAt: null, isLate: false, sentAt: null, usedAt: null, archivedAt: null, releasedAsModel: false,
});

function subjectsList() {
  const fromPapers = PAPERS.map((p) => {
    const s = userById(p.setterId);
    return { ...p.subject, setter: s ? { id: s.id, displayName: s.displayName, email: s.email } : null, paper: { id: p.id, status: p.status } };
  });
  return [...fromPapers, ...UNASSIGNED_SUBJECTS.map((s) => ({ ...s, setter: null, paper: null }))].sort((a, b) => a.examDate.localeCompare(b.examDate));
}

const userRow = (u: (typeof USERS)[number]) => {
  const c = CENTRES.find((x) => x.supId === u.id);
  return {
    id: u.id, email: u.email, role: u.role, displayName: u.displayName, isActive: u.isActive, locked: u.locked, lastLoginAt: u.lastLoginAt,
    bioDataComplete: u.role === "SETTER" ? !!u.setterProfile : u.role === "SUPERINTENDENT" ? !!u.superintendent : null,
    setterProfile: u.setterProfile, centre: c ? { id: c.id, code: c.code, name: c.name } : null,
  };
};

function centreAssignments(centreId: string) {
  return PAPERS.flatMap((p) =>
    p.status === "SENT_TO_CENTRE" || p.status === "USED" ? p.centres.filter((c) => c.centreId === centreId).map((c) => ({ p, c })) : [],
  );
}

function setterReport(semester: string | null) {
  return USERS.filter((u) => u.role === "SETTER").map((u) => {
    const mine = bySemester(PAPERS.filter((p) => p.setterId === u.id), semester);
    const set = mine.filter((p) => p.status !== "DRAFT");
    const late = set.filter((p) => p.isLate).length;
    return {
      setterId: u.id, name: u.setterProfile?.fullName ?? u.displayName, email: u.email, institution: u.setterProfile?.institution ?? "",
      assigned: mine.length, papersSet: set.length, lateSubmissions: late,
      overdueDrafts: mine.filter((p) => p.status === "DRAFT" && new Date(p.subject.submissionDeadline) < new Date()).length,
      revisionCount: mine.reduce((n, p) => n + p.revisions.length, 0),
      onTimeRate: set.length ? Math.round(((set.length - late) / set.length) * 100) : null,
    };
  });
}

function centreReport(semester: string | null) {
  return CENTRES.map((c) => {
    const rows = bySemester(PAPERS.filter((p) => p.centres.some((x) => x.centreId === c.id)), semester).map((p) => {
      const a = p.centres.find((x) => x.centreId === c.id)!;
      return {
        subject: `${p.subject.code} — ${p.subject.title}`, semester: p.subject.semester, examType: p.subject.examType, scheduledAt: a.availableFrom,
        firstAccessAt: a.firstAccessAt, firstDownloadAt: a.firstDownloadAt, downloadCount: a.downloadCount,
        delayMinutes: a.firstDownloadAt ? Math.round((new Date(a.firstDownloadAt).getTime() - new Date(a.availableFrom).getTime()) / 60_000) : null,
      };
    });
    return {
      centreId: c.id, code: c.code, name: c.name, city: c.city, assignedPapers: rows.length,
      downloadedPapers: rows.filter((r) => r.downloadCount > 0).length, totalDownloads: rows.reduce((n, r) => n + r.downloadCount, 0), rows,
    };
  });
}

// Readable label for an audit entry's entity (paper / subject code, user email, centre code).
function entityLabel(entity: string | null, id: string | null) {
  if (!entity || !id) return null;
  if (entity === "Paper") return PAPERS.find((p) => p.id === id)?.subject.code ?? null;
  if (entity === "Subject") return allSubjects().find((s) => s.id === id)?.code ?? null;
  if (entity === "User") return userById(id)?.email ?? null;
  if (entity === "Centre") return CENTRES.find((c) => c.id === id)?.code ?? null;
  if (entity === "Resource") return RESOURCES.find((r) => r.id === id)?.title ?? null;
  return null;
}

// ---------------------------------------------------------------- file views (preview / centre download / model paper)
// Called by the /demo/view page. Returns the paper to render, or throws the same error the real route would.
export async function demoViewPaper(src: string) {
  load();
  const me = await whoAmI();
  const u = new URL(src, window.location.origin);
  let m = u.pathname.match(/^\/api\/papers\/([^/]+)\/preview$/);
  if (m) {
    if (me.role === "SUPERINTENDENT") throw new DemoError(403, "Centres can only open papers from their exam schedule");
    const p = me.role === "SETTER" ? setterPaper(m[1], me) : me.role === "TYPIST" ? typistPaper(m[1], me) : paper(m[1]);
    return { paper: p, banner: `CONFIDENTIAL PREVIEW — status: ${p.status}`, watermark: undefined as string | undefined };
  }
  m = u.pathname.match(/^\/api\/setter\/model-papers\/([^/]+)$/);
  if (m) {
    if (me.role !== "SETTER") throw new DemoError(403, "Model papers are opened from the Setter's library");
    const p = paper(m[1]);
    if (p.status !== "USED" || !p.releasedAsModel || p.subject.semester === currentSemester) throw new DemoError(404, "Paper not found");
    return { paper: p, banner: "MODEL PAPER — released for reference", watermark: undefined };
  }
  m = u.pathname.match(/^\/api\/centre\/papers\/([^/]+)\/download$/);
  if (m) {
    if (me.role !== "SUPERINTENDENT") throw new DemoError(403, "Only Centre Superintendents can download exam papers");
    const c = myCentre(me);
    const p = PAPERS.find((x) => x.id === m![1]);
    const a = p?.centres.find((x) => x.centreId === c?.id);
    if (!c || !p || !a || (p.status !== "SENT_TO_CENTRE" && p.status !== "USED")) throw new DemoError(404, "Paper not found");
    if (new Date() < new Date(a.availableFrom)) throw new DemoError(423, `This paper is time-locked until ${new Date(a.availableFrom).toLocaleString()}`);
    // FR-19 log + FR-20 auto-USED, exactly as the real route does.
    const kind = u.searchParams.get("mode") === "view" ? "VIEW" : "DOWNLOAD";
    const t = now();
    ACCESS.unshift({ id: newId("acc"), paperId: p.id, centreId: c.id, kind, at: t, ip: "10.0.4.21" });
    a.firstAccessAt ??= t;
    if (kind === "DOWNLOAD") {
      a.downloadCount += 1;
      a.firstDownloadAt ??= t;
    }
    audit(me, kind === "DOWNLOAD" ? "PAPER_DOWNLOADED" : "PAPER_ACCESSED", "Paper", p.id, { centre: c.code, subject: p.subject.code });
    if (p.status === "SENT_TO_CENTRE") {
      p.status = "USED";
      p.usedAt = t;
      audit(me, "PAPER_MARKED_USED", "Paper", p.id, { centre: c.code });
    }
    save();
    return { paper: p, banner: undefined, watermark: `${c.code} · ${t.slice(0, 16).replace("T", " ")} UTC` };
  }
  throw new DemoError(404, "Not found");
}

export const demoInstitution = () => institutionName;

// ---------------------------------------------------------------- routes
type Handler = (m: RegExpMatchArray, q: URLSearchParams, b: Record<string, unknown>, me: Me) => unknown;
type Who = Role | "ANY" | "PUBLIC";
const routes: [string, RegExp, Who, Handler][] = [
  // ---- auth ----
  ["POST", /^\/api\/auth\/login$/, "PUBLIC", () => { throw new DemoError(400, "This is a design preview. Use one of the demo role buttons below to sign in."); }],
  ["POST", /^\/api\/auth\/forgot$/, "PUBLIC", () => ({ message: "Demo mode: no email is sent. Enter any 6-digit code to continue." })],
  ["POST", /^\/api\/auth\/reset$/, "PUBLIC", (_m, _q, b) => {
    const u = USERS.find((x) => x.email === String(b.email ?? "").toLowerCase());
    if (u) audit({ id: u.id, role: u.role, name: u.displayName }, "PASSWORD_RESET_COMPLETED", "User", u.id, { method: "email_otp" });
    return { ok: true };
  }],
  ["POST", /^\/api\/auth\/change-password$/, "ANY", (_m, _q, _b, me) => {
    audit(me, "PASSWORD_CHANGED", "User", me.id);
    return { ok: true };
  }],

  // ---- controller ----
  ["GET", /^\/api\/controller\/dashboard$/, "CONTROLLER", (_m, q) => {
    const rows = bySemester(PAPERS, q.get("semester"));
    const counts: Record<string, number> = {};
    rows.forEach((p) => (counts[p.status] = (counts[p.status] ?? 0) + 1));
    const users: Record<string, number> = {};
    USERS.filter((u) => u.isActive).forEach((u) => (users[u.role] = (users[u.role] ?? 0) + 1));
    const upcoming = PAPERS.flatMap((p) => p.centres.filter((c) => new Date(c.availableFrom) > new Date()).map((c) => ({
      paperId: p.id, code: p.subject.code, title: p.subject.title, status: p.status, centre: centreById(c.centreId).code, availableFrom: c.availableFrom,
    }))).sort((a, b) => a.availableFrom.localeCompare(b.availableFrom));
    return {
      counts, overdue: rows.filter((p) => p.status === "DRAFT" && new Date(p.subject.submissionDeadline) < new Date()).length,
      upcoming, users, centres: CENTRES.length, recent: AUDIT.slice(0, 8), semesters: semesters(), currentSemester,
    };
  }],
  ["GET", /^\/api\/controller\/papers$/, "CONTROLLER", (_m, q) => ({
    papers: bySemester(PAPERS, q.get("semester")).filter((p) => !q.get("status") || p.status === q.get("status")).map((p) => {
      const v = controllerView(p);
      return { ...v, centres: v.centres.map((c) => ({ code: c.code, downloadCount: c.downloadCount })) };
    }),
    semesters: semesters(), currentSemester,
  })],
  ["GET", /^\/api\/controller\/papers\/([^/]+)$/, "CONTROLLER", (m) => {
    const p = paper(m[1]);
    const seeded = p.centres.flatMap((c) => {
      const x = centreById(c.centreId);
      const out = [];
      if (c.firstAccessAt) out.push({ id: `${p.id}-${c.centreId}-a`, kind: "VIEW", at: c.firstAccessAt, ip: "10.0.4.21", centre: { code: x.code, name: x.name } });
      if (c.firstDownloadAt) out.push({ id: `${p.id}-${c.centreId}-d`, kind: "DOWNLOAD", at: c.firstDownloadAt, ip: "10.0.4.21", centre: { code: x.code, name: x.name } });
      return out;
    });
    const live = ACCESS.filter((a) => a.paperId === p.id).map((a) => ({ id: a.id, kind: a.kind, at: a.at, ip: a.ip, centre: { code: centreById(a.centreId).code, name: centreById(a.centreId).name } }));
    // Live events include the first ones, so drop seeded "first" rows that a live event duplicates.
    const accessLogs = [...live, ...seeded.filter((s) => !live.some((l) => l.at === s.at && l.kind === s.kind))].sort((a, b) => b.at.localeCompare(a.at));
    return {
      paper: controllerView(p),
      revisions: p.revisions.map((r) => ({ id: r.id, editorRole: r.editorRole, note: r.note, createdAt: r.createdAt, editor: { displayName: r.editorName } })),
      accessLogs,
      options: {
        typists: USERS.filter((u) => u.role === "TYPIST" && u.isActive).map((u) => ({ id: u.id, displayName: u.displayName, email: u.email })),
        centres: CENTRES.map((c) => ({ id: c.id, code: c.code, name: c.name, city: c.city })),
      },
      currentSemester,
    };
  }],
  ["PATCH", /^\/api\/controller\/papers\/([^/]+)$/, "CONTROLLER", (m, _q, b, me) => {
    const p = paper(m[1]);
    applyEdit(p, b, me);
    return { paper: controllerView(p) };
  }],
  ["POST", /^\/api\/controller\/papers\/([^/]+)\/actions$/, "CONTROLLER", (m, _q, b, me) => {
    const p = paper(m[1]);
    if (p.status === "ARCHIVED") throw new DemoError(423, "Archived papers are permanently locked");
    switch (b.action) {
      case "send":
        sendToCentres(p, me);
        break;
      case "recall":
        assertTransition(p.status, "UNDER_MODIFICATION");
        if (p.centres.some((c) => c.firstAccessAt || c.downloadCount > 0)) throw new DemoError(409, "A centre has already accessed this paper");
        p.status = "UNDER_MODIFICATION";
        p.sentAt = null;
        audit(me, "PAPER_RECALLED", "Paper", p.id, { subject: p.subject.code });
        break;
      case "archive":
        assertTransition(p.status, "ARCHIVED");
        p.status = "ARCHIVED";
        p.archivedAt = now();
        p.releasedAsModel = false;
        audit(me, "PAPER_ARCHIVED", "Paper", p.id, { subject: p.subject.code });
        break;
      case "releaseModel":
        if (p.status !== "USED") throw new DemoError(409, "Only USED papers can be released as model papers");
        if (b.released && p.subject.semester === currentSemester) throw new DemoError(409, "Papers from the current semester cannot be released as model papers");
        p.releasedAsModel = !!b.released;
        audit(me, "MODEL_RELEASE_CHANGED", "Paper", p.id, { released: !!b.released });
        break;
      case "assignTypist": {
        if (p.status === "USED") throw new DemoError(423, "Paper is locked after use");
        const typistId = (b.typistId as string) || null;
        if (typistId) {
          const t = userById(typistId);
          if (!t || t.role !== "TYPIST" || !t.isActive) throw new DemoError(400, "Selected user is not an active Typist");
        }
        const canSend = !!typistId && !!b.canSend;
        if (typistId !== p.typistId) audit(me, "TYPIST_ASSIGNED", "Paper", p.id, { subject: p.subject.code, from: p.typistId, to: typistId });
        if (canSend !== p.typistCanSend) audit(me, "DELEGATION_CHANGED", "Paper", p.id, { subject: p.subject.code, canSendToCentre: canSend });
        p.typistId = typistId;
        p.typistCanSend = canSend;
        break;
      }
      case "setCentres": {
        if (p.status === "USED") throw new DemoError(423, "Paper is locked after use");
        const list = (b.centres as { centreId: string; availableFrom?: string }[]) ?? [];
        const removed = p.centres.filter((c) => !list.some((x) => x.centreId === c.centreId));
        if (removed.some((c) => c.downloadCount > 0)) throw new DemoError(409, "A centre that already downloaded the paper cannot be removed");
        for (const c of list) {
          const prev = p.centres.find((x) => x.centreId === c.centreId);
          const when = c.availableFrom ?? p.subject.examDate;
          if (prev?.availableFrom !== when) checkUnlockTime(new Date(when), new Date(p.subject.examDate), centreById(c.centreId)?.code ?? c.centreId);
        }
        p.centres = list.map((c) => ({
          ...(p.centres.find((x) => x.centreId === c.centreId) ?? { firstAccessAt: null, firstDownloadAt: null, downloadCount: 0 }),
          centreId: c.centreId, availableFrom: c.availableFrom ?? p.subject.examDate,
        }));
        audit(me, "CENTRES_ASSIGNED", "Paper", p.id, { subject: p.subject.code, centres: list.map((c) => centreById(c.centreId)?.code) });
        break;
      }
    }
    return { paper: controllerView(p) };
  }],
  ["GET", /^\/api\/controller\/subjects$/, "CONTROLLER", (_m, q) => ({ subjects: subjectsList().filter((s) => !q.get("semester") || s.semester === q.get("semester")), semesters: semesters() })],
  ["POST", /^\/api\/controller\/subjects$/, "CONTROLLER", (_m, _q, b, me) => {
    const code = String(b.code ?? "").trim().toUpperCase();
    const semester = String(b.semester ?? "").trim();
    const title = String(b.title ?? "").trim();
    const examType = String(b.examType);
    if (code.length < 2 || title.length < 2) throw new DemoError(400, "Code and title are required");
    if (!SEMESTER_RE.test(semester)) throw new DemoError(400, "Semester must look like “Fall 2026” (Spring, Summer, Fall or Winter, then the year)");
    if (!EXAM_TYPES.includes(examType)) throw new DemoError(400, "Unknown exam type");
    const examDate = new Date(String(b.examDate)), deadline = new Date(String(b.submissionDeadline));
    if (isNaN(+examDate) || isNaN(+deadline)) throw new DemoError(400, "Exam date and submission deadline are required");
    if (deadline >= examDate) throw new DemoError(400, "Submission deadline must be before the exam date");
    if (allSubjects().some((s) => s.code === code && s.semester === semester && s.examType === examType)) {
      throw new DemoError(409, "This subject already exists for that semester and exam type");
    }
    if (b.setterId) setterIsAssignable(String(b.setterId));
    const subject = { id: newId("s"), code, title, semester, examType, examDate: examDate.toISOString(), submissionDeadline: deadline.toISOString() };
    if (b.setterId) PAPERS.unshift(newPaper(subject, String(b.setterId)));
    else UNASSIGNED_SUBJECTS.push(subject);
    audit(me, "SUBJECT_CREATED", "Subject", subject.id, { code, semester });
    if (b.setterId) audit(me, "SETTER_ASSIGNED", "Subject", subject.id, { setterId: b.setterId });
    return { ok: true };
  }],
  ["PATCH", /^\/api\/controller\/subjects\/([^/]+)$/, "CONTROLLER", (m, _q, b, me) => {
    const p = PAPERS.find((x) => x.subject.id === m[1]);
    if (b.setterId) setterIsAssignable(String(b.setterId));
    if (p && p.status !== "DRAFT") throw new DemoError(409, "The setter can't be changed once the paper has been submitted");
    if (p && b.setterId) p.setterId = String(b.setterId);
    else if (p && !b.setterId) {
      PAPERS.splice(PAPERS.indexOf(p), 1);
      UNASSIGNED_SUBJECTS.push(p.subject);
    } else if (!p && b.setterId) {
      const i = UNASSIGNED_SUBJECTS.findIndex((s) => s.id === m[1]);
      if (i < 0) throw new DemoError(404, "Subject not found");
      const [subject] = UNASSIGNED_SUBJECTS.splice(i, 1);
      PAPERS.unshift(newPaper(subject, String(b.setterId)));
    }
    audit(me, "SETTER_ASSIGNED", "Subject", m[1], { setterId: b.setterId ?? null });
    return { ok: true };
  }],
  ["GET", /^\/api\/controller\/users$/, "CONTROLLER", (_m, q) => ({ users: USERS.filter((u) => !q.get("role") || u.role === q.get("role")).map(userRow) })],
  ["POST", /^\/api\/controller\/users$/, "CONTROLLER", (_m, _q, b, me) => {
    const email = String(b.email).toLowerCase();
    if (USERS.some((u) => u.email === email)) throw new DemoError(409, "An account with this email already exists");
    if (!["SETTER", "TYPIST", "SUPERINTENDENT"].includes(String(b.role))) throw new DemoError(400, "Unknown role");
    const centreId = b.role === "SUPERINTENDENT" ? (b.centreId as string) || null : null;
    if (centreId && !CENTRES.some((c) => c.id === centreId)) throw new DemoError(400, "Centre not found");
    const id = newId("u");
    USERS.push({ id, email, role: b.role as Role, displayName: String(b.displayName), isActive: true, locked: false, lastLoginAt: null, setterProfile: null, superintendent: null });
    if (centreId) CENTRES.find((c) => c.id === centreId)!.supId = id;
    audit(me, "ACCOUNT_CREATED", "User", id, { email, role: b.role, centre: centreId ? centreById(centreId).code : undefined });
    return { temporaryPassword: "Demo-" + Math.random().toString(36).slice(2, 10) + "!7" };
  }],
  ["GET", /^\/api\/controller\/users\/([^/]+)$/, "CONTROLLER", (m) => {
    const u = userById(m[1]);
    if (!u) throw new DemoError(404, "User not found");
    return { user: { ...u } };
  }],
  ["PATCH", /^\/api\/controller\/users\/([^/]+)$/, "CONTROLLER", (m, _q, b, me) => {
    const u = userById(m[1]);
    if (!u) throw new DemoError(404, "User not found");
    if ("isActive" in b) u.isActive = !!b.isActive;
    if (b.unlock) u.locked = false;
    audit(me, "ACCOUNT_UPDATED", "User", u.id, b);
    return { ok: true };
  }],
  // FR-5: the Controller can enter or correct a Superintendent's bio-data.
  ["PUT", /^\/api\/controller\/users\/([^/]+)\/superintendent$/, "CONTROLLER", (m, _q, b, me) => {
    const u = userById(m[1]);
    if (!u || u.role !== "SUPERINTENDENT") throw new DemoError(404, "Superintendent not found");
    u.superintendent = checkSuperintendentBio(b);
    audit(me, "BIODATA_UPDATED", "User", u.id, { by: "controller" });
    return { ok: true };
  }],
  ["GET", /^\/api\/controller\/centres$/, "CONTROLLER", () => ({
    centres: CENTRES.map((c) => {
      const s = userById(c.supId);
      return {
        ...c,
        superintendent: s ? { id: s.id, displayName: s.displayName, email: s.email, superintendent: s.superintendent ? { fullName: s.superintendent.fullName, phone: s.superintendent.phone } : null } : null,
        _count: { assignments: PAPERS.filter((p) => p.centres.some((x) => x.centreId === c.id)).length },
      };
    }),
    superintendents: USERS.filter((u) => u.role === "SUPERINTENDENT").map((u) => {
      const c = CENTRES.find((x) => x.supId === u.id);
      return { id: u.id, displayName: u.displayName, email: u.email, centre: c ? { id: c.id } : null };
    }),
  })],
  ["POST", /^\/api\/controller\/centres$/, "CONTROLLER", (_m, _q, b, me) => {
    const code = String(b.code).toUpperCase();
    if (CENTRES.some((c) => c.code === code)) throw new DemoError(409, "A centre with this code already exists");
    const id = newId("c");
    CENTRES.push({ id, code, name: String(b.name), address: String(b.address ?? ""), city: String(b.city ?? ""), capacity: Number(b.capacity ?? 0), supId: (b.superintendentId as string) || null });
    audit(me, "CENTRE_CREATED", "Centre", id, { code });
    return { ok: true };
  }],
  ["PATCH", /^\/api\/controller\/centres\/([^/]+)$/, "CONTROLLER", (m, _q, b, me) => {
    const c = CENTRES.find((x) => x.id === m[1]);
    if (!c) throw new DemoError(404, "Centre not found");
    const supId = (b.superintendentId as string) || null;
    CENTRES.forEach((x) => { if (supId && x.supId === supId) x.supId = null; }); // one centre per superintendent
    c.supId = supId;
    audit(me, "CENTRE_UPDATED", "Centre", c.id, { superintendentId: supId });
    return { ok: true };
  }],
  ["GET", /^\/api\/controller\/resources$/, "CONTROLLER", () => ({
    resources: RESOURCES.map((r) => {
      const s = allSubjects().find((x) => x.id === r.subjectId);
      return { ...r, subject: s ? { code: s.code, title: s.title, semester: s.semester } : null };
    }),
    subjects: allSubjects().map((s) => ({ id: s.id, code: s.code, title: s.title, semester: s.semester })),
    semesters: semesters(),
  })],
  ["POST", /^\/api\/controller\/resources$/, "CONTROLLER", (_m, _q, b, me) => {
    const semester = (b.semester as string) || null;
    if (semester && !SEMESTER_RE.test(semester)) throw new DemoError(400, "Semester must look like “Fall 2026”");
    const id = newId("res");
    RESOURCES.unshift({
      id, kind: String(b.kind), title: String(b.title), semester, subjectId: (b.subjectId as string) || null,
      createdAt: now(), file: { originalName: String(b.fileName ?? "upload.pdf"), sizeBytes: Number(b.fileSize ?? 120_000) },
    });
    audit(me, "RESOURCE_UPLOADED", "Resource", id, { kind: b.kind, title: b.title });
    return { ok: true };
  }],
  ["DELETE", /^\/api\/controller\/resources\/([^/]+)$/, "CONTROLLER", (m, _q, _b, me) => {
    const i = RESOURCES.findIndex((r) => r.id === m[1]);
    if (i >= 0) {
      audit(me, "RESOURCE_DELETED", "Resource", m[1], { title: RESOURCES[i].title });
      RESOURCES.splice(i, 1);
    }
    return { ok: true };
  }],
  ["GET", /^\/api\/controller\/reports$/, "CONTROLLER", (_m, q) => {
    const type = q.get("type");
    if (type !== "setters" && type !== "centres") throw new DemoError(400, "type must be setters or centres");
    return { rows: type === "centres" ? centreReport(q.get("semester")) : setterReport(q.get("semester")), semesters: semesters() };
  }],
  ["GET", /^\/api\/controller\/audit$/, "CONTROLLER", (_m, q) => {
    const from = q.get("from"), to = q.get("to");
    if (from && to && from > to) throw new DemoError(400, "The “From” date must be on or before the “To” date");
    const rows = AUDIT.filter((l) =>
      (!q.get("email") || (l.userEmail ?? "").includes(q.get("email")!.toLowerCase())) &&
      (!q.get("role") || l.role === q.get("role")) &&
      (!q.get("action") || l.action === q.get("action")) &&
      (!from || l.at.slice(0, 10) >= from) && (!to || l.at.slice(0, 10) <= to));
    const page = Number(q.get("page") ?? 1), pageSize = 20;
    return {
      total: rows.length, page, pageSize,
      rows: rows.slice((page - 1) * pageSize, page * pageSize).map((l) => ({ ...l, entityLabel: entityLabel(l.entity, l.entityId) })),
      actions: AUDIT_ACTIONS,
    };
  }],
  ["GET", /^\/api\/controller\/audit\/verify$/, "CONTROLLER", () => ({ valid: true, total: AUDIT.length, brokenAtSeq: null })],
  ["GET", /^\/api\/controller\/settings$/, "CONTROLLER", () => ({ currentSemester, institutionName, semesters: semesters() })],
  ["PUT", /^\/api\/controller\/settings$/, "CONTROLLER", (_m, _q, b, me) => {
    const sem = String(b.currentSemester).trim();
    if (!SEMESTER_RE.test(sem)) throw new DemoError(400, "Semester must look like “Fall 2026”");
    currentSemester = sem;
    institutionName = String(b.institutionName);
    audit(me, "SETTINGS_UPDATED", null, null, { currentSemester, institutionName });
    return { ok: true };
  }],

  // ---- setter ----
  ["GET", /^\/api\/setter\/papers$/, "SETTER", (_m, q, _b, me) => ({
    papers: bySemester(PAPERS.filter((p) => p.setterId === me.id && p.status !== "ARCHIVED"), q.get("semester")).map(setterView),
    semesters: semesters(),
  })],
  ["GET", /^\/api\/setter\/papers\/([^/]+)$/, "SETTER", (m, _q, _b, me) => ({ paper: setterView(setterPaper(m[1], me)) })],
  ["PATCH", /^\/api\/setter\/papers\/([^/]+)$/, "SETTER", (m, _q, b, me) => {
    const p = setterPaper(m[1], me);
    applyEdit(p, b, me);
    return { paper: setterView(p) };
  }],
  ["POST", /^\/api\/setter\/papers\/([^/]+)$/, "SETTER", (m, _q, _b, me) => {
    const p = setterPaper(m[1], me);
    assertTransition(p.status, "SUBMITTED");
    if (!hasContent(p)) {
      throw new DemoError(400, p.format === "FILE" ? "Upload the paper file before submitting" : "The paper is empty. Write the questions or upload a file before submitting");
    }
    p.status = "SUBMITTED";
    p.submittedAt = now();
    p.isLate = new Date(p.subject.submissionDeadline) < new Date();
    audit(me, "PAPER_SUBMITTED", "Paper", p.id, { subject: p.subject.code, isLate: p.isLate });
    return { paper: setterView(p) };
  }],
  ["GET", /^\/api\/setter\/resources$/, "SETTER", () => {
    const view = (r: (typeof RESOURCES)[number]) => {
      const s = allSubjects().find((x) => x.id === r.subjectId);
      return { id: r.id, title: r.title, semester: r.semester ?? s?.semester ?? null, subject: s ? { code: s.code, title: s.title } : null, sizeBytes: r.file.sizeBytes, createdAt: r.createdAt };
    };
    return {
      syllabi: RESOURCES.filter((r) => r.kind === "SYLLABUS").map(view),
      modelPapers: RESOURCES.filter((r) => r.kind === "MODEL_PAPER").map(view),
      // FR-22: only USED papers from past semesters that the Controller released. Archived ones are withdrawn.
      releasedPapers: PAPERS.filter((p) => p.status === "USED" && p.releasedAsModel && p.subject.semester !== currentSemester)
        .map((p) => ({ paperId: p.id, code: p.subject.code, title: p.subject.title, semester: p.subject.semester, examType: p.subject.examType })),
      semesters: semesters(),
    };
  }],
  ["GET", /^\/api\/setter\/biodata$/, "SETTER", (_m, _q, _b, me) => ({ profile: userById(me.id)!.setterProfile, email: userEmail(me.id) })],
  ["PUT", /^\/api\/setter\/biodata$/, "SETTER", (_m, _q, b, me) => {
    const u = userById(me.id)!;
    const first = !u.setterProfile;
    u.setterProfile = b as never;
    audit(me, "BIODATA_UPDATED", "User", me.id);
    // Re-issue the session with bio-data complete so the FR-4 gate lets this setter in.
    if (first) return fetch(`/api/demo/login?role=SETTER&user=${me.id}&pc=1`, { redirect: "manual" }).then(() => ({ ok: true }));
    return { ok: true };
  }],

  // ---- typist ----
  ["GET", /^\/api\/typist\/papers$/, "TYPIST", (_m, q, _b, me) => ({
    papers: bySemester(PAPERS.filter((p) => p.typistId === me.id && p.status !== "ARCHIVED" && p.status !== "DRAFT"), q.get("semester")).map(typistView),
    semesters: semesters(),
  })],
  ["GET", /^\/api\/typist\/papers\/([^/]+)$/, "TYPIST", (m, _q, _b, me) => ({ paper: typistView(typistPaper(m[1], me)) })],
  ["PATCH", /^\/api\/typist\/papers\/([^/]+)$/, "TYPIST", (m, _q, b, me) => {
    const p = typistPaper(m[1], me);
    applyEdit(p, b, me);
    return { paper: typistView(p) };
  }],
  ["POST", /^\/api\/typist\/papers\/([^/]+)$/, "TYPIST", (m, _q, _b, me) => {
    const p = typistPaper(m[1], me);
    sendToCentres(p, me);
    return { paper: typistView(p) };
  }],

  // ---- shared ----
  ["POST", /^\/api\/papers\/([^/]+)\/file$/, "ANY", (m, _q, b, me) => {
    if (me.role === "SUPERINTENDENT") throw new DemoError(403, "Not allowed");
    const p = me.role === "SETTER" ? setterPaper(m[1], me) : me.role === "TYPIST" ? typistPaper(m[1], me) : paper(m[1]);
    assertEditable(me.role, p.status);
    if (me.role !== "SETTER") {
      p.revisions.unshift({ id: newId("r"), editorRole: me.role, editorName: me.name, note: "Uploaded revised file", createdAt: now() });
      p.status = "UNDER_MODIFICATION";
    }
    p.format = "FILE";
    p.file = { name: String(b.fileName ?? "paper.pdf"), sizeBytes: Number(b.fileSize ?? 200_000) };
    audit(me, "PAPER_FILE_UPLOADED", "Paper", p.id, { subject: p.subject.code, sizeBytes: p.file.sizeBytes });
    // Each role gets its own view, so the upload response never carries the setter's identity to a Typist.
    return { paper: me.role === "CONTROLLER" ? controllerView(p) : me.role === "TYPIST" ? typistView(p) : setterView(p) };
  }],

  // ---- centre ----
  ["GET", /^\/api\/centre\/papers$/, "SUPERINTENDENT", (_m, _q, _b, me) => {
    const c = myCentre(me);
    if (!c) throw new DemoError(403, "Your account is not linked to an examination centre yet. Contact the Examinations Office.");
    const papers = centreAssignments(c.id).map(({ p, c: a }) => ({
      paperId: p.id, subject: { code: p.subject.code, title: p.subject.title, semester: p.subject.semester, examType: p.subject.examType },
      availableFrom: a.availableFrom, durationMinutes: p.durationMinutes, totalMarks: p.totalMarks, unlocked: new Date(a.availableFrom) <= new Date(),
      downloadCount: a.downloadCount, firstAccessAt: a.firstAccessAt, firstDownloadAt: a.firstDownloadAt, status: p.status === "USED" ? "USED" : "SENT_TO_CENTRE",
    }));
    return { centre: { code: c.code, name: c.name, city: c.city }, serverNow: now(), papers };
  }],
  ["GET", /^\/api\/centre\/profile$/, "SUPERINTENDENT", (_m, _q, _b, me) => {
    const c = myCentre(me);
    return {
      profile: userById(me.id)!.superintendent,
      centre: c ? { code: c.code, name: c.name, address: c.address, city: c.city, capacity: c.capacity } : null,
      email: userEmail(me.id),
    };
  }],
  ["PUT", /^\/api\/centre\/profile$/, "SUPERINTENDENT", (_m, _q, b, me) => {
    userById(me.id)!.superintendent = checkSuperintendentBio(b);
    audit(me, "BIODATA_UPDATED", "User", me.id);
    return { ok: true };
  }],
];

function checkSuperintendentBio(b: Record<string, unknown>) {
  const f = (k: string) => String(b[k] ?? "").trim();
  if (!f("fullName") || !f("phone")) throw new DemoError(400, "Full name and phone are required");
  if (!/^\d{5}-\d{7}-\d$/.test(f("cnic"))) throw new DemoError(400, "CNIC must look like 12345-1234567-1");
  return { fullName: f("fullName"), cnic: f("cnic"), designation: f("designation"), organization: f("organization"), phone: f("phone"), address: f("address") };
}

// FR-18: same unlock-time rule as the real API.
function checkUnlockTime(at: Date, examDate: Date, centre: string) {
  const err = unlockTimeError(at, examDate, centre);
  if (err) throw new DemoError(400, err);
}

export async function demoApi<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  await new Promise((r) => setTimeout(r, 150)); // feel like a network call
  load();
  const u = new URL(url, window.location.origin);
  const method = (init?.method ?? "GET").toUpperCase();
  let b: Record<string, unknown> = {};
  if (init?.json !== undefined) b = init.json as Record<string, unknown>;
  else if (init?.body instanceof FormData) {
    init.body.forEach((v, k) => {
      if (v instanceof File) {
        b.fileName = v.name;
        b.fileSize = v.size;
      } else b[k] = v;
    });
  }
  for (const [m, re, who, h] of routes) {
    const match = u.pathname.match(re);
    if (m !== method || !match) continue;
    let me: Me = { id: "", role: "CONTROLLER", name: "" };
    if (who !== "PUBLIC") {
      me = await whoAmI();
      if (who !== "ANY" && me.role !== who) throw new DemoError(403, "You do not have access to this page");
    }
    try {
      const out = await h(match, u.searchParams, b, me);
      if (method !== "GET") save();
      return JSON.parse(JSON.stringify(out)) as T;
    } catch (e) {
      if (e instanceof DemoError) throw e;
      throw new DemoError(500, (e as Error).message);
    }
  }
  throw new DemoError(404, "Not found");
}

export { DemoError };
