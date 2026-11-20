// Frontend-only demo backend: answers the same URLs the real API serves, from in-memory sample data.
// Changes live only in this browser tab and reset on reload.
import { CURRENT_SEMESTER, DEMO_USERS, CENTRES, INSTITUTION, PAPERS, RESOURCES, SEMESTERS, UNASSIGNED_SUBJECTS, USERS, AUDIT, centreById, userById, type DemoPaper } from "./data";

let currentSemester = CURRENT_SEMESTER;
let institutionName = INSTITUTION;
let idSeq = 1;
const newId = (p: string) => `${p}-new${idSeq++}`;
const now = () => new Date().toISOString();

class DemoError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const setterName = (p: DemoPaper) => userById(p.setterId)?.setterProfile?.fullName ?? userById(p.setterId)?.displayName ?? "—";
const bySemester = <T extends { subject: { semester: string } }>(rows: T[], s: string | null) => (s ? rows.filter((r) => r.subject.semester === s) : rows);

function content(p: DemoPaper) {
  return {
    format: p.format, mode: p.mode, contentHtml: p.contentHtml, sectionAHtml: p.sectionAHtml, sectionBHtml: p.sectionBHtml, sectionCHtml: p.sectionCHtml,
    instructions: p.instructions, totalMarks: p.totalMarks, durationMinutes: p.durationMinutes,
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
  id: p.id, status: p.status === "ARCHIVED" ? "USED" : p.status, subject: p.subject, ...content(p), submittedAt: p.submittedAt, isLate: p.isLate, editable: p.status === "DRAFT",
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

function applyEdit(p: DemoPaper, b: Record<string, unknown>, role: string, name: string) {
  for (const k of ["format", "mode", "contentHtml", "sectionAHtml", "sectionBHtml", "sectionCHtml", "instructions", "totalMarks", "durationMinutes"] as const) {
    if (k in b) (p as Record<string, unknown>)[k] = b[k];
  }
  if (role !== "SETTER") {
    p.revisions.unshift({ id: newId("r"), editorRole: role, editorName: name, note: String(b.note ?? ""), createdAt: now() });
    p.status = "UNDER_MODIFICATION";
  }
}

function sendToCentres(p: DemoPaper) {
  if (p.centres.length === 0) throw new DemoError(400, "Assign at least one centre first");
  p.status = "SENT_TO_CENTRE";
  p.sentAt = now();
}

function subjectsList() {
  const fromPapers = PAPERS.map((p) => {
    const s = userById(p.setterId);
    return { ...p.subject, setter: s ? { id: s.id, displayName: s.displayName, email: s.email } : null, paper: { id: p.id, status: p.status } };
  });
  return [...fromPapers, ...UNASSIGNED_SUBJECTS.map((s) => ({ ...s, setter: null, paper: null }))];
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
    p.status === "SENT_TO_CENTRE" || p.status === "USED"
      ? p.centres.filter((c) => c.centreId === centreId).map((c) => ({ p, c }))
      : [],
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

type Handler = (m: RegExpMatchArray, q: URLSearchParams, b: Record<string, unknown>) => unknown;
const routes: [string, RegExp, Handler][] = [
  // ---- auth ----
  ["POST", /^\/api\/auth\/login$/, () => { throw new DemoError(400, "This is a design preview. Use one of the demo role buttons below to sign in."); }],
  ["POST", /^\/api\/auth\/forgot$/, () => ({ message: "Demo mode: no email is sent. Enter any 6-digit code to continue." })],
  ["POST", /^\/api\/auth\/reset$/, () => ({ ok: true })],
  ["POST", /^\/api\/auth\/change-password$/, () => ({ ok: true })],

  // ---- controller ----
  ["GET", /^\/api\/controller\/dashboard$/, (_m, q) => {
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
      upcoming, users, centres: CENTRES.length, recent: AUDIT.slice(0, 8), semesters: SEMESTERS, currentSemester,
    };
  }],
  ["GET", /^\/api\/controller\/papers$/, (_m, q) => ({
    papers: bySemester(PAPERS, q.get("semester")).filter((p) => !q.get("status") || p.status === q.get("status")).map((p) => {
      const v = controllerView(p);
      return { ...v, centres: v.centres.map((c) => ({ code: c.code, downloadCount: c.downloadCount })) };
    }),
    semesters: SEMESTERS, currentSemester,
  })],
  ["GET", /^\/api\/controller\/papers\/([^/]+)$/, (m) => {
    const p = paper(m[1]);
    return {
      paper: controllerView(p),
      revisions: p.revisions.map((r) => ({ id: r.id, editorRole: r.editorRole, note: r.note, createdAt: r.createdAt, editor: { displayName: r.editorName } })),
      accessLogs: p.centres.flatMap((c) => {
        const x = centreById(c.centreId);
        const out = [];
        if (c.firstAccessAt) out.push({ id: `${p.id}-${c.centreId}-a`, kind: "VIEW", at: c.firstAccessAt, ip: "10.0.4.21", centre: { code: x.code, name: x.name } });
        if (c.firstDownloadAt) out.push({ id: `${p.id}-${c.centreId}-d`, kind: "DOWNLOAD", at: c.firstDownloadAt, ip: "10.0.4.21", centre: { code: x.code, name: x.name } });
        return out;
      }),
      options: {
        typists: USERS.filter((u) => u.role === "TYPIST" && u.isActive).map((u) => ({ id: u.id, displayName: u.displayName, email: u.email })),
        centres: CENTRES.map((c) => ({ id: c.id, code: c.code, name: c.name, city: c.city })),
      },
      currentSemester,
    };
  }],
  ["PATCH", /^\/api\/controller\/papers\/([^/]+)$/, (m, _q, b) => {
    const p = paper(m[1]);
    applyEdit(p, b, "CONTROLLER", DEMO_USERS.CONTROLLER.name);
    return { paper: controllerView(p) };
  }],
  ["POST", /^\/api\/controller\/papers\/([^/]+)\/actions$/, (m, _q, b) => {
    const p = paper(m[1]);
    switch (b.action) {
      case "send": sendToCentres(p); break;
      case "recall": p.status = "UNDER_MODIFICATION"; p.sentAt = null; break;
      case "archive": p.status = "ARCHIVED"; p.archivedAt = now(); break;
      case "releaseModel": p.releasedAsModel = !!b.released; break;
      case "assignTypist": p.typistId = (b.typistId as string) ?? null; p.typistCanSend = !!b.typistId && !!b.canSend; break;
      case "setCentres": {
        const list = b.centres as { centreId: string; availableFrom: string }[];
        p.centres = list.map((c) => ({ ...(p.centres.find((x) => x.centreId === c.centreId) ?? { firstAccessAt: null, firstDownloadAt: null, downloadCount: 0 }), centreId: c.centreId, availableFrom: c.availableFrom }));
        break;
      }
    }
    return { paper: controllerView(p) };
  }],
  ["GET", /^\/api\/controller\/subjects$/, (_m, q) => ({ subjects: subjectsList().filter((s) => !q.get("semester") || s.semester === q.get("semester")), semesters: SEMESTERS })],
  ["POST", /^\/api\/controller\/subjects$/, (_m, _q, b) => {
    const subject = {
      id: newId("s"), code: String(b.code).toUpperCase(), title: String(b.title), semester: String(b.semester), examType: String(b.examType),
      examDate: String(b.examDate), submissionDeadline: String(b.submissionDeadline),
    };
    if (b.setterId) {
      PAPERS.unshift({
        id: newId("p"), status: "DRAFT", subject, setterId: String(b.setterId), typistId: null, typistCanSend: false, format: "RICH_TEXT", mode: "FREE",
        contentHtml: "", sectionAHtml: "", sectionBHtml: "", sectionCHtml: "", instructions: "", totalMarks: null, durationMinutes: null, file: null,
        centres: [], revisions: [], submittedAt: null, isLate: false, sentAt: null, usedAt: null, archivedAt: null, releasedAsModel: false,
      });
    } else UNASSIGNED_SUBJECTS.push(subject);
    return { ok: true };
  }],
  ["PATCH", /^\/api\/controller\/subjects\/([^/]+)$/, (m, _q, b) => {
    const p = PAPERS.find((x) => x.subject.id === m[1]);
    if (p && b.setterId) p.setterId = String(b.setterId);
    else if (p && !b.setterId) {
      PAPERS.splice(PAPERS.indexOf(p), 1);
      UNASSIGNED_SUBJECTS.push(p.subject);
    } else if (!p && b.setterId) {
      const i = UNASSIGNED_SUBJECTS.findIndex((s) => s.id === m[1]);
      const [subject] = UNASSIGNED_SUBJECTS.splice(i, 1);
      PAPERS.unshift({
        id: newId("p"), status: "DRAFT", subject, setterId: String(b.setterId), typistId: null, typistCanSend: false, format: "RICH_TEXT", mode: "FREE",
        contentHtml: "", sectionAHtml: "", sectionBHtml: "", sectionCHtml: "", instructions: "", totalMarks: null, durationMinutes: null, file: null,
        centres: [], revisions: [], submittedAt: null, isLate: false, sentAt: null, usedAt: null, archivedAt: null, releasedAsModel: false,
      });
    }
    return { ok: true };
  }],
  ["GET", /^\/api\/controller\/users$/, (_m, q) => ({ users: USERS.filter((u) => !q.get("role") || u.role === q.get("role")).map(userRow) })],
  ["POST", /^\/api\/controller\/users$/, (_m, _q, b) => {
    if (USERS.some((u) => u.email === String(b.email).toLowerCase())) throw new DemoError(409, "An account with this email already exists");
    USERS.push({ id: newId("u"), email: String(b.email).toLowerCase(), role: b.role as never, displayName: String(b.displayName), isActive: true, locked: false, lastLoginAt: null, setterProfile: null, superintendent: null });
    return { temporaryPassword: "Demo-" + Math.random().toString(36).slice(2, 10) + "!7" };
  }],
  ["GET", /^\/api\/controller\/users\/([^/]+)$/, (m) => {
    const u = userById(m[1]);
    if (!u) throw new DemoError(404, "User not found");
    return { user: { ...u } };
  }],
  ["PATCH", /^\/api\/controller\/users\/([^/]+)$/, (m, _q, b) => {
    const u = userById(m[1]);
    if (!u) throw new DemoError(404, "User not found");
    if ("isActive" in b) u.isActive = !!b.isActive;
    if (b.unlock) u.locked = false;
    return { ok: true };
  }],
  ["GET", /^\/api\/controller\/centres$/, () => ({
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
  ["POST", /^\/api\/controller\/centres$/, (_m, _q, b) => {
    CENTRES.push({ id: newId("c"), code: String(b.code).toUpperCase(), name: String(b.name), address: String(b.address ?? ""), city: String(b.city ?? ""), capacity: Number(b.capacity ?? 0), supId: (b.superintendentId as string) || null });
    return { ok: true };
  }],
  ["PATCH", /^\/api\/controller\/centres\/([^/]+)$/, (m, _q, b) => {
    const c = CENTRES.find((x) => x.id === m[1]);
    if (c) c.supId = (b.superintendentId as string) || null;
    return { ok: true };
  }],
  ["GET", /^\/api\/controller\/resources$/, () => ({
    resources: RESOURCES.map((r) => {
      const s = [...PAPERS.map((p) => p.subject), ...UNASSIGNED_SUBJECTS].find((x) => x.id === r.subjectId);
      return { ...r, subject: s ? { code: s.code, title: s.title, semester: s.semester } : null };
    }),
    subjects: [...PAPERS.map((p) => p.subject), ...UNASSIGNED_SUBJECTS].map((s) => ({ id: s.id, code: s.code, title: s.title, semester: s.semester })),
  })],
  ["POST", /^\/api\/controller\/resources$/, (_m, _q, b) => {
    RESOURCES.unshift({
      id: newId("res"), kind: String(b.kind), title: String(b.title), semester: (b.semester as string) || null, subjectId: (b.subjectId as string) || null,
      createdAt: now(), file: { originalName: String(b.fileName ?? "upload.pdf"), sizeBytes: Number(b.fileSize ?? 120_000) },
    });
    return { ok: true };
  }],
  ["DELETE", /^\/api\/controller\/resources\/([^/]+)$/, (m) => {
    const i = RESOURCES.findIndex((r) => r.id === m[1]);
    if (i >= 0) RESOURCES.splice(i, 1);
    return { ok: true };
  }],
  ["GET", /^\/api\/controller\/reports$/, (_m, q) => ({ rows: q.get("type") === "centres" ? centreReport(q.get("semester")) : setterReport(q.get("semester")), semesters: SEMESTERS })],
  ["GET", /^\/api\/controller\/audit$/, (_m, q) => {
    const from = q.get("from"), to = q.get("to");
    const rows = AUDIT.filter((l) =>
      (!q.get("email") || (l.userEmail ?? "").includes(q.get("email")!.toLowerCase())) &&
      (!q.get("role") || l.role === q.get("role")) &&
      (!q.get("action") || l.action === q.get("action")) &&
      (!from || l.at >= from) && (!to || l.at.slice(0, 10) <= to));
    const page = Number(q.get("page") ?? 1), pageSize = 20;
    return { total: rows.length, page, pageSize, rows: rows.slice((page - 1) * pageSize, page * pageSize), actions: Array.from(new Set(AUDIT.map((l) => l.action))).sort() };
  }],
  ["GET", /^\/api\/controller\/audit\/verify$/, () => ({ valid: true, total: AUDIT.length, brokenAtSeq: null })],
  ["GET", /^\/api\/controller\/settings$/, () => ({ currentSemester, institutionName, semesters: SEMESTERS })],
  ["PUT", /^\/api\/controller\/settings$/, (_m, _q, b) => {
    currentSemester = String(b.currentSemester);
    institutionName = String(b.institutionName);
    return { ok: true };
  }],

  // ---- setter ----
  ["GET", /^\/api\/setter\/papers$/, (_m, q) => ({ papers: bySemester(PAPERS.filter((p) => p.setterId === DEMO_USERS.SETTER.id), q.get("semester")).map(setterView), semesters: SEMESTERS })],
  ["GET", /^\/api\/setter\/papers\/([^/]+)$/, (m) => ({ paper: setterView(paper(m[1])) })],
  ["PATCH", /^\/api\/setter\/papers\/([^/]+)$/, (m, _q, b) => {
    const p = paper(m[1]);
    if (p.status !== "DRAFT") throw new DemoError(409, "This paper has been submitted and can no longer be edited");
    applyEdit(p, b, "SETTER", DEMO_USERS.SETTER.name);
    return { paper: setterView(p) };
  }],
  ["POST", /^\/api\/setter\/papers\/([^/]+)$/, (m) => {
    const p = paper(m[1]);
    p.status = "SUBMITTED";
    p.submittedAt = now();
    p.isLate = new Date(p.subject.submissionDeadline) < new Date();
    return { paper: setterView(p) };
  }],
  ["GET", /^\/api\/setter\/resources$/, () => {
    const view = (r: (typeof RESOURCES)[number]) => {
      const s = PAPERS.map((p) => p.subject).find((x) => x.id === r.subjectId);
      return { id: r.id, title: r.title, semester: r.semester, subject: s ? { code: s.code, title: s.title } : null, sizeBytes: r.file.sizeBytes, createdAt: r.createdAt };
    };
    return {
      syllabi: RESOURCES.filter((r) => r.kind === "SYLLABUS").map(view),
      modelPapers: RESOURCES.filter((r) => r.kind === "MODEL_PAPER").map(view),
      releasedPapers: PAPERS.filter((p) => p.releasedAsModel && p.subject.semester !== currentSemester).map((p) => ({ paperId: p.id, code: p.subject.code, title: p.subject.title, semester: p.subject.semester, examType: p.subject.examType })),
    };
  }],
  ["GET", /^\/api\/setter\/biodata$/, () => ({ profile: userById(DEMO_USERS.SETTER.id)!.setterProfile, email: DEMO_USERS.SETTER.email })],
  ["PUT", /^\/api\/setter\/biodata$/, (_m, _q, b) => {
    userById(DEMO_USERS.SETTER.id)!.setterProfile = b as never;
    return { ok: true };
  }],

  // ---- typist ----
  ["GET", /^\/api\/typist\/papers$/, (_m, q) => ({ papers: bySemester(PAPERS.filter((p) => p.typistId === DEMO_USERS.TYPIST.id && p.status !== "ARCHIVED"), q.get("semester")).map(typistView), semesters: SEMESTERS })],
  ["GET", /^\/api\/typist\/papers\/([^/]+)$/, (m) => ({ paper: typistView(paper(m[1])) })],
  ["PATCH", /^\/api\/typist\/papers\/([^/]+)$/, (m, _q, b) => {
    const p = paper(m[1]);
    applyEdit(p, b, "TYPIST", DEMO_USERS.TYPIST.name);
    return { paper: typistView(p) };
  }],
  ["POST", /^\/api\/typist\/papers\/([^/]+)$/, (m) => {
    const p = paper(m[1]);
    sendToCentres(p);
    return { paper: typistView(p) };
  }],

  // ---- shared ----
  ["POST", /^\/api\/papers\/([^/]+)\/file$/, (m, _q, b) => {
    const p = paper(m[1]);
    p.format = "FILE";
    p.file = { name: String(b.fileName ?? "paper.pdf"), sizeBytes: Number(b.fileSize ?? 200_000) };
    return { paper: { ...controllerView(p), ...content(p), editable: true, canSend: p.typistCanSend } };
  }],

  // ---- centre ----
  ["GET", /^\/api\/centre\/papers$/, () => {
    const c = CENTRES.find((x) => x.supId === DEMO_USERS.SUPERINTENDENT.id)!;
    return {
      centre: { code: c.code, name: c.name, city: c.city },
      serverNow: now(),
      papers: centreAssignments(c.id).map(({ p, c: a }) => ({
        paperId: p.id, subject: { code: p.subject.code, title: p.subject.title, semester: p.subject.semester, examType: p.subject.examType },
        availableFrom: a.availableFrom, durationMinutes: p.durationMinutes, totalMarks: p.totalMarks, unlocked: new Date(a.availableFrom) <= new Date(),
        downloadCount: a.downloadCount, firstDownloadAt: a.firstDownloadAt, status: p.status === "USED" ? "USED" : "SENT_TO_CENTRE",
      })),
    };
  }],
  ["GET", /^\/api\/centre\/profile$/, () => {
    const c = CENTRES.find((x) => x.supId === DEMO_USERS.SUPERINTENDENT.id)!;
    return { profile: userById(DEMO_USERS.SUPERINTENDENT.id)!.superintendent, centre: { code: c.code, name: c.name, address: c.address, city: c.city, capacity: c.capacity }, email: DEMO_USERS.SUPERINTENDENT.email };
  }],
  ["PUT", /^\/api\/centre\/profile$/, (_m, _q, b) => {
    userById(DEMO_USERS.SUPERINTENDENT.id)!.superintendent = b as never;
    return { ok: true };
  }],
];

export async function demoApi<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  await new Promise((r) => setTimeout(r, 150)); // feel like a network call
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
  for (const [m, re, h] of routes) {
    const match = u.pathname.match(re);
    if (m === method && match) {
      try {
        return JSON.parse(JSON.stringify(h(match, u.searchParams, b))) as T;
      } catch (e) {
        if (e instanceof DemoError) throw e;
        throw new DemoError(500, (e as Error).message);
      }
    }
  }
  return { ok: true } as T;
}

export { DemoError };
