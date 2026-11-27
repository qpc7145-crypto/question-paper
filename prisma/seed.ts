/* eslint-disable no-console */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { ExamType, PaperStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../src/server/core/db";
import { auditStandalone as audit } from "../src/server/modules/audit/service";
import { ensureBucket, newStorageKey, putObject } from "../src/server/infra/storage";
import { parseTermLabel } from "../src/server/modules/academics/terms";
import { sealCnic } from "../src/server/infra/crypto";

// Runs after every deploy (prisma/deploy.ts applies migrations first). Idempotent.
//  - always: DB triggers + RLS lockdown, private storage bucket
//  - SEED_DEMO=true: full demo data with shared test passwords (never in production)
//  - otherwise: a single Controller from CONTROLLER_EMAIL / INITIAL_CONTROLLER_PASSWORD
const PASSWORD = "Password@2026";
const DEMO = process.env.SEED_DEMO === "true" || process.argv.includes("--demo");

const hours = (h: number) => new Date(Date.now() + h * 3600_000);
const days = (d: number) => hours(d * 24);
const minutes = (m: number) => new Date(Date.now() + m * 60_000);

async function applyTriggers() {
  const sql = await fs.readFile(path.join(__dirname, "triggers.sql"), "utf8");
  for (const stmt of sql.split("--split")) {
    const s = stmt.replace(/^\s*--.*$/gm, "").trim();
    if (s) await prisma.$executeRawUnsafe(s);
  }
}

async function makePdf(title: string, lines: string[]) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  page.drawText(title, { x: 56, y: 780, size: 16, font: bold });
  lines.forEach((l, i) => page.drawText(l, { x: 56, y: 740 - i * 20, size: 12, font }));
  return Buffer.from(await doc.save());
}

async function storeFile(buf: Buffer, originalName: string, uploadedById: string) {
  const storageKey = newStorageKey();
  await putObject(storageKey, buf, "application/pdf");
  return prisma.storedFile.create({
    data: {
      storageKey, originalName, mimeType: "application/pdf", sizeBytes: buf.length,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"), uploadedById,
    },
  });
}

async function setCurrentTerm(label: string) {
  const t = parseTermLabel(label);
  if (!t) {
    console.warn(`CURRENT_SEMESTER "${label}" is not like "Fall 2026"; no current semester set.`);
    return;
  }
  await prisma.term.upsert({ where: { season_year: t }, update: { isCurrent: true }, create: { ...t, isCurrent: true } });
}

async function seedProductionController() {
  const email = (process.env.CONTROLLER_EMAIL || "").toLowerCase();
  const password = process.env.INITIAL_CONTROLLER_PASSWORD || "";
  if (!email || password.length < 12) {
    console.warn("No Controller exists. Set CONTROLLER_EMAIL and INITIAL_CONTROLLER_PASSWORD (12+ chars) to create one.");
    return;
  }
  const controller = await prisma.user.create({
    data: { email, displayName: "Controller of Examinations", role: "CONTROLLER", passwordHash: await bcrypt.hash(password, 12) },
  });
  if (!(await prisma.term.findFirst({ where: { isCurrent: true } }))) await setCurrentTerm(process.env.CURRENT_SEMESTER || "Fall 2026");
  const institutionName = process.env.INSTITUTION_NAME || "Examinations Department";
  await prisma.setting.upsert({ where: { key: "institutionName" }, update: {}, create: { key: "institutionName", value: institutionName } });
  await audit({ actor: { id: controller.id, email, role: "CONTROLLER" }, action: "ACCOUNT_CREATED", entity: "User", entityId: controller.id, details: { bootstrap: true }, ip: null });
  console.log(`Created Controller account ${email}. Change the initial password after first sign-in.`);
}

// ---------- Demo data helpers ----------

async function exam(code: string, title: string, semester: string, examType: ExamType, examDate: Date, submissionDeadline: Date) {
  const t = parseTermLabel(semester)!;
  const term = await prisma.term.upsert({ where: { season_year: t }, update: {}, create: t });
  const course = await prisma.course.upsert({ where: { code }, update: { title }, create: { code, title } });
  return prisma.exam.create({ data: { courseId: course.id, termId: term.id, examType, title, examDate, submissionDeadline } });
}

type Content = {
  mode?: "FREE" | "STRUCTURED";
  format?: "RICH_TEXT" | "FILE";
  contentHtml?: string;
  sections?: { A?: string; B?: string; C?: string };
  instructions?: string;
  totalMarks?: number;
  durationMinutes?: number;
  fileId?: string;
};

// A paper with its version history and assignments, as the app would have produced it.
async function paper(opts: {
  examId: string;
  setterId: string;
  status?: PaperStatus;
  content?: Content;
  typist?: { id: string; canSend?: boolean };
  revisions?: { authorId: string; authorRole: Role; note: string }[];
  extra?: Partial<Prisma.PaperUncheckedCreateInput>;
}) {
  const status = opts.status ?? "DRAFT";
  // Archived rows are locked by a trigger, so archive only in the final update below.
  const p = await prisma.paper.create({ data: { examId: opts.examId, status: status === "ARCHIVED" ? "USED" : status, ...opts.extra } });
  await prisma.paperAssignment.create({ data: { paperId: p.id, userId: opts.setterId, role: "SETTER" } });
  if (opts.typist) {
    await prisma.paperAssignment.create({ data: { paperId: p.id, userId: opts.typist.id, role: "TYPIST", canSend: !!opts.typist.canSend } });
  }
  const c = opts.content ?? {};
  const data = {
    mode: c.mode ?? "FREE",
    format: c.format ?? "RICH_TEXT",
    content: { contentHtml: c.contentHtml ?? "", sections: { A: c.sections?.A ?? "", B: c.sections?.B ?? "", C: c.sections?.C ?? "" } },
    instructions: c.instructions ?? "",
    totalMarks: c.totalMarks ?? null,
    durationMinutes: c.durationMinutes ?? null,
    fileId: c.fileId ?? null,
  };
  const frozen = status === "DRAFT" ? null : new Date();
  let v = await prisma.paperVersion.create({ data: { paperId: p.id, number: 1, ...data, authorId: opts.setterId, authorRole: "SETTER", frozenAt: frozen } });
  for (const [i, r] of (opts.revisions ?? []).entries()) {
    v = await prisma.paperVersion.create({ data: { paperId: p.id, number: i + 2, ...data, ...r, frozenAt: new Date() } });
  }
  const sent = ["SENT_TO_CENTRE", "USED", "ARCHIVED"].includes(status);
  return prisma.paper.update({
    where: { id: p.id },
    data: { status, currentVersionId: v.id, sentVersionId: sent ? v.id : null, revisionCount: opts.revisions?.length ?? 0 },
  });
}

async function main() {
  await applyTriggers();
  await ensureBucket();
  if (await prisma.user.findFirst({ where: { role: "CONTROLLER" } })) {
    console.log("Database already seeded — triggers and bucket verified.");
    return;
  }
  if (!DEMO) return seedProductionController();
  const hash = await bcrypt.hash(PASSWORD, 12);
  const user = (email: string, displayName: string, role: Role) =>
    prisma.user.create({ data: { email, displayName, role, passwordHash: hash } });

  const controller = await user("controller@qpbank.edu", "Dr. Controller of Examinations", "CONTROLLER");
  const setter1 = await user("setter1@qpbank.edu", "Setter One", "SETTER");
  const setter2 = await user("setter2@qpbank.edu", "Setter Two", "SETTER"); // bio-data intentionally blank (FR-4 gate demo)
  const typist = await user("typist@qpbank.edu", "Paper Typist", "TYPIST");
  const supA = await user("centre.a@qpbank.edu", "Superintendent Centre A", "SUPERINTENDENT");
  const supB = await user("centre.b@qpbank.edu", "Superintendent Centre B", "SUPERINTENDENT");
  for (const u of [setter1, setter2, typist, supA, supB]) await prisma.user.update({ where: { id: u.id }, data: { createdById: controller.id } });

  await prisma.setterProfile.create({
    data: {
      userId: setter1.id, fullName: "Dr. Ayesha Khan", ...sealCnic("35202-1234567-8"), qualification: "PhD Computer Science",
      institution: "Government College University", experienceYears: 12, specialization: "Algorithms & Data Structures",
      phone: "+92 300 1234567", address: "12 Canal Road, Lahore", subjectsEligible: "CS-201, CS-301, MATH-201",
    },
  });
  await prisma.superintendentProfile.create({
    data: { userId: supA.id, fullName: "Mr. Imran Ali", ...sealCnic("35202-7654321-1"), designation: "Principal", organization: "Govt. High School No. 1", phone: "+92 321 7654321", address: "Mall Road, Lahore" },
  });

  const centreA = await prisma.centre.create({ data: { code: "LHR-01", name: "Govt. High School No. 1", address: "Mall Road", city: "Lahore", capacity: 400, superintendentId: supA.id } });
  const centreB = await prisma.centre.create({ data: { code: "LHR-02", name: "Islamia College Hall B", address: "Railway Road", city: "Lahore", capacity: 250, superintendentId: supB.id } });

  await setCurrentTerm("Fall 2026");
  await prisma.setting.create({ data: { key: "institutionName", value: "Board of Intermediate & Secondary Education" } });

  // 1) DRAFT — setter1, current semester, structured
  const s1 = await exam("CS-301", "Advanced Data Structures", "Fall 2026", "FINAL", days(30), days(10));
  await paper({
    examId: s1.id, setterId: setter1.id,
    content: {
      mode: "STRUCTURED",
      instructions: "Attempt all questions. Section A is compulsory. Use of calculator is allowed.",
      totalMarks: 75, durationMinutes: 180,
      sections: {
        A: "<p><strong>Q1.</strong> Choose the correct option (10 × 1 = 10)</p><ol><li><p>Time complexity of binary search is O(log<sub>2</sub> n).</p></li><li><p>A stack follows the LIFO principle.</p></li></ol>",
        B: "<p><strong>Q2.</strong> Explain the difference between a linked list and an array. (15)</p><p><strong>Q3.</strong> Derive the recurrence T(n) = 2T(n/2) + n. (15)</p>",
      },
    },
  });

  // 2) SUBMITTED (late) — assigned to typist with delegation, two centres
  const s2 = await exam("MATH-201", "Linear Algebra", "Fall 2026", "MIDTERM", days(3), days(-1));
  const p2 = await paper({
    examId: s2.id, setterId: setter1.id, status: "SUBMITTED", typist: { id: typist.id, canSend: true },
    extra: { submittedAt: hours(-6), isLate: true },
    content: {
      totalMarks: 50, durationMinutes: 120, instructions: "Attempt any FOUR questions.",
      contentHtml: "<p><strong>Q1.</strong> Find the eigenvalues of A = [[2, 1], [1, 2]].</p><p><strong>Q2.</strong> Prove that det(AB) = det(A)·det(B).</p><p><strong>Q3.</strong> Solve x<sup>2</sup> − 5x + 6 = 0 using matrices.</p>",
    },
  });
  await prisma.paperCentre.createMany({ data: [{ paperId: p2.id, centreId: centreA.id, availableFrom: s2.examDate }, { paperId: p2.id, centreId: centreB.id, availableFrom: s2.examDate }] });

  // 3) DRAFT — setter2 (profile incomplete)
  const s3 = await exam("PHY-101", "Physics I", "Fall 2026", "FINAL", days(35), days(14));
  await paper({ examId: s3.id, setterId: setter2.id });

  // 4) SENT_TO_CENTRE — unlocks 3 minutes after seeding (live countdown demo); one typist revision
  const s4 = await exam("ENG-101", "English Composition", "Fall 2026", "MIDTERM", minutes(3), days(-5));
  const p4 = await paper({
    examId: s4.id, setterId: setter1.id, status: "SENT_TO_CENTRE", typist: { id: typist.id },
    extra: { submittedAt: days(-6), sentAt: days(-1) },
    revisions: [{ authorId: typist.id, authorRole: "TYPIST", note: "Formatting corrections" }],
    content: {
      totalMarks: 60, durationMinutes: 150, instructions: "Answer all questions in English.",
      contentHtml: "<p><strong>Q1.</strong> Write an essay (400 words) on “Technology and Education”. (20)</p><p><strong>Q2.</strong> Summarise the given passage. (20)</p><p><strong>Q3.</strong> Write a formal letter to the editor. (20)</p>",
    },
  });
  await prisma.paperCentre.createMany({ data: [{ paperId: p4.id, centreId: centreA.id, availableFrom: s4.examDate }, { paperId: p4.id, centreId: centreB.id, availableFrom: s4.examDate }] });

  // 5) USED + released model paper — past semester, uploaded PDF
  const s5 = await exam("CS-201", "Data Structures", "Spring 2026", "FINAL", days(-160), days(-175));
  const pdf5 = await storeFile(
    await makePdf("CS-201 Data Structures - Final Examination (Spring 2026)", [
      "Time allowed: 3 hours            Maximum marks: 75",
      "Q1. Define abstract data type with examples. (10)",
      "Q2. Implement a queue using two stacks. (15)",
      "Q3. Compare AVL and Red-Black trees. (25)",
      "Q4. Explain hashing and collision resolution. (25)",
    ]),
    "ayesha_khan_cs201_final.pdf", // deliberately identifying — never shown to non-controllers
    setter1.id,
  );
  const p5 = await paper({
    examId: s5.id, setterId: setter1.id, status: "USED",
    extra: { submittedAt: days(-178), sentAt: days(-165), usedAt: days(-160), releasedAsModel: true },
    content: { format: "FILE", fileId: pdf5.id, totalMarks: 75, durationMinutes: 180 },
  });
  await prisma.paperCentre.create({ data: { paperId: p5.id, centreId: centreA.id, availableFrom: s5.examDate, firstAccessAt: s5.examDate, firstDownloadAt: s5.examDate, downloadCount: 1 } });
  await prisma.accessLog.create({ data: { paperId: p5.id, versionId: p5.currentVersionId!, centreId: centreA.id, userId: supA.id, kind: "DOWNLOAD", at: s5.examDate, ip: "10.0.0.21" } });

  // 6) ARCHIVED — past semester, Controller-only
  const s6 = await exam("CS-101", "Introduction to Computing", "Spring 2026", "MIDTERM", days(-200), days(-215));
  await paper({
    examId: s6.id, setterId: setter2.id, status: "ARCHIVED",
    extra: { submittedAt: days(-216), sentAt: days(-205), usedAt: days(-200), archivedAt: days(-150) },
    content: { contentHtml: "<p><strong>Q1.</strong> What is an algorithm?</p>", totalMarks: 30, durationMinutes: 60 },
  });

  // Syllabus resources (FR-15)
  const syl = await storeFile(await makePdf("CS-301 Advanced Data Structures - Syllabus", ["Unit 1: Trees", "Unit 2: Graphs", "Unit 3: Hashing", "Unit 4: Advanced sorting"]), "cs301-syllabus.pdf", controller.id);
  await prisma.resource.create({ data: { kind: "SYLLABUS", title: "CS-301 Syllabus", examId: s1.id, semester: "Fall 2026", fileId: syl.id } });
  const gen = await storeFile(await makePdf("Paper Setting Guidelines", ["1. Follow the approved syllabus.", "2. Balance easy, moderate and difficult questions.", "3. Do not include your name anywhere in the paper."]), "guidelines.pdf", controller.id);
  await prisma.resource.create({ data: { kind: "SYLLABUS", title: "General Paper Setting Guidelines", fileId: gen.id } });

  const sys = { id: controller.id, email: controller.email, role: "CONTROLLER" as const };
  await audit({ actor: sys, action: "SETTINGS_UPDATED", details: { seed: true, currentSemester: "Fall 2026" }, ip: null });
  for (const u of [setter1, setter2, typist, supA, supB]) {
    await audit({ actor: sys, action: "ACCOUNT_CREATED", entity: "User", entityId: u.id, details: { email: u.email, role: u.role, seed: true }, ip: null });
  }

  console.log("\nSeed complete. All accounts use password:", PASSWORD);
  console.table([
    { role: "Controller", email: controller.email },
    { role: "Setter (bio-data done)", email: setter1.email },
    { role: "Setter (bio-data pending)", email: setter2.email },
    { role: "Typist", email: typist.email },
    { role: "Centre LHR-01", email: supA.email },
    { role: "Centre LHR-02", email: supB.email },
  ]);
  console.log("ENG-101 unlocks for centres at", minutes(3).toLocaleString(), "(3 minutes after seeding).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
