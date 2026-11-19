/* eslint-disable no-console */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PrismaClient } from "@prisma/client";
import { audit } from "../src/lib/audit";
import { ensureBucket, newStorageKey, putObject } from "../src/lib/storage";

// Runs after every schema push (locally and in the Vercel build). Idempotent.
//  - always: DB triggers + RLS lockdown, private storage bucket
//  - SEED_DEMO=true: full demo data with shared test passwords (never in production)
//  - otherwise: a single Controller from CONTROLLER_EMAIL / INITIAL_CONTROLLER_PASSWORD
const prisma = new PrismaClient();
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
  for (const [key, value] of [["currentSemester", process.env.CURRENT_SEMESTER || "Fall 2026"], ["institutionName", process.env.INSTITUTION_NAME || "Examinations Department"]]) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  await audit({ actor: { id: controller.id, email, role: "CONTROLLER" }, action: "ACCOUNT_CREATED", entity: "User", entityId: controller.id, details: { bootstrap: true }, ip: null });
  console.log(`Created Controller account ${email}. Change the initial password after first sign-in.`);
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
  const user = (email: string, displayName: string, role: string) =>
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
      userId: setter1.id, fullName: "Dr. Ayesha Khan", cnic: "35202-1234567-8", qualification: "PhD Computer Science",
      institution: "Government College University", experienceYears: 12, specialization: "Algorithms & Data Structures",
      phone: "+92 300 1234567", address: "12 Canal Road, Lahore", subjectsEligible: "CS-201, CS-301, MATH-201",
    },
  });
  await prisma.superintendentProfile.create({
    data: { userId: supA.id, fullName: "Mr. Imran Ali", cnic: "35202-7654321-1", designation: "Principal", organization: "Govt. High School No. 1", phone: "+92 321 7654321", address: "Mall Road, Lahore" },
  });

  const centreA = await prisma.centre.create({ data: { code: "LHR-01", name: "Govt. High School No. 1", address: "Mall Road", city: "Lahore", capacity: 400, superintendentId: supA.id } });
  const centreB = await prisma.centre.create({ data: { code: "LHR-02", name: "Islamia College Hall B", address: "Railway Road", city: "Lahore", capacity: 250, superintendentId: supB.id } });

  await prisma.setting.createMany({
    data: [
      { key: "currentSemester", value: "Fall 2026" },
      { key: "institutionName", value: "Board of Intermediate & Secondary Education" },
    ],
  });

  const subject = (code: string, title: string, semester: string, examType: string, examDate: Date, submissionDeadline: Date, setterId: string) =>
    prisma.subject.create({ data: { code, title, semester, examType, examDate, submissionDeadline, setterId } });

  const structured = {
    mode: "STRUCTURED",
    instructions: "Attempt all questions. Section A is compulsory. Use of calculator is allowed.",
    totalMarks: 75,
    durationMinutes: 180,
    sectionAHtml: "<p><strong>Q1.</strong> Choose the correct option (10 × 1 = 10)</p><ol><li><p>Time complexity of binary search is O(log<sub>2</sub> n).</p></li><li><p>A stack follows the LIFO principle.</p></li></ol>",
    sectionBHtml: "<p><strong>Q2.</strong> Explain the difference between a linked list and an array. (15)</p><p><strong>Q3.</strong> Derive the recurrence T(n) = 2T(n/2) + n. (15)</p>",
    sectionCHtml: "<p><strong>Q4.</strong> Design an algorithm to detect a cycle in a directed graph. (35)</p>",
  };

  // 1) DRAFT — setter1, current semester
  const s1 = await subject("CS-301", "Advanced Data Structures", "Fall 2026", "FINAL", days(30), days(10), setter1.id);
  await prisma.paper.create({ data: { subjectId: s1.id, setterId: setter1.id, ...structured, sectionCHtml: "" } });

  // 2) SUBMITTED (late) — assigned to typist with delegation, two centres
  const s2 = await subject("MATH-201", "Linear Algebra", "Fall 2026", "MIDTERM", days(3), days(-1), setter1.id);
  const p2 = await prisma.paper.create({
    data: {
      subjectId: s2.id, setterId: setter1.id, status: "SUBMITTED", submittedAt: hours(-6), isLate: true,
      typistId: typist.id, typistCanSend: true, mode: "FREE", totalMarks: 50, durationMinutes: 120,
      instructions: "Attempt any FOUR questions.",
      contentHtml: "<p><strong>Q1.</strong> Find the eigenvalues of A = [[2, 1], [1, 2]].</p><p><strong>Q2.</strong> Prove that det(AB) = det(A)·det(B).</p><p><strong>Q3.</strong> Solve x<sup>2</sup> − 5x + 6 = 0 using matrices.</p>",
    },
  });
  await prisma.paperCentre.createMany({ data: [{ paperId: p2.id, centreId: centreA.id, availableFrom: s2.examDate }, { paperId: p2.id, centreId: centreB.id, availableFrom: s2.examDate }] });

  // 3) DRAFT — setter2 (profile incomplete)
  const s3 = await subject("PHY-101", "Physics I", "Fall 2026", "FINAL", days(35), days(14), setter2.id);
  await prisma.paper.create({ data: { subjectId: s3.id, setterId: setter2.id } });

  // 4) SENT_TO_CENTRE — unlocks 3 minutes after seeding (live countdown demo)
  const s4 = await subject("ENG-101", "English Composition", "Fall 2026", "MIDTERM", minutes(3), days(-5), setter1.id);
  const p4 = await prisma.paper.create({
    data: {
      subjectId: s4.id, setterId: setter1.id, status: "SENT_TO_CENTRE", submittedAt: days(-6), sentAt: days(-1),
      typistId: typist.id, revisionCount: 1, mode: "FREE", totalMarks: 60, durationMinutes: 150,
      instructions: "Answer all questions in English.",
      contentHtml: "<p><strong>Q1.</strong> Write an essay (400 words) on “Technology and Education”. (20)</p><p><strong>Q2.</strong> Summarise the given passage. (20)</p><p><strong>Q3.</strong> Write a formal letter to the editor. (20)</p>",
    },
  });
  await prisma.paperRevision.create({ data: { paperId: p4.id, editorId: typist.id, editorRole: "TYPIST", note: "Formatting corrections", snapshot: "{}" } });
  await prisma.paperCentre.createMany({ data: [{ paperId: p4.id, centreId: centreA.id, availableFrom: s4.examDate }, { paperId: p4.id, centreId: centreB.id, availableFrom: s4.examDate }] });

  // 5) USED + released model paper — past semester, uploaded PDF
  const s5 = await subject("CS-201", "Data Structures", "Spring 2026", "FINAL", days(-160), days(-175), setter1.id);
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
  const p5 = await prisma.paper.create({
    data: {
      subjectId: s5.id, setterId: setter1.id, status: "USED", format: "FILE", fileId: pdf5.id, submittedAt: days(-178),
      sentAt: days(-165), usedAt: days(-160), releasedAsModel: true, totalMarks: 75, durationMinutes: 180,
    },
  });
  await prisma.paperCentre.create({ data: { paperId: p5.id, centreId: centreA.id, availableFrom: s5.examDate, firstAccessAt: s5.examDate, firstDownloadAt: s5.examDate, downloadCount: 1 } });
  await prisma.accessLog.create({ data: { paperId: p5.id, centreId: centreA.id, userId: supA.id, kind: "DOWNLOAD", at: s5.examDate, ip: "10.0.0.21" } });

  // 6) ARCHIVED — past semester, Controller-only
  const s6 = await subject("CS-101", "Introduction to Computing", "Spring 2026", "MIDTERM", days(-200), days(-215), setter2.id);
  await prisma.paper.create({
    data: {
      subjectId: s6.id, setterId: setter2.id, status: "ARCHIVED", submittedAt: days(-216), sentAt: days(-205), usedAt: days(-200), archivedAt: days(-150),
      contentHtml: "<p><strong>Q1.</strong> What is an algorithm?</p>", totalMarks: 30, durationMinutes: 60,
    },
  });

  // Syllabus resources (FR-15)
  const syl = await storeFile(await makePdf("CS-301 Advanced Data Structures - Syllabus", ["Unit 1: Trees", "Unit 2: Graphs", "Unit 3: Hashing", "Unit 4: Advanced sorting"]), "cs301-syllabus.pdf", controller.id);
  await prisma.resource.create({ data: { kind: "SYLLABUS", title: "CS-301 Syllabus", subjectId: s1.id, semester: "Fall 2026", fileId: syl.id } });
  const gen = await storeFile(await makePdf("Paper Setting Guidelines", ["1. Follow the approved syllabus.", "2. Balance easy, moderate and difficult questions.", "3. Do not include your name anywhere in the paper."]), "guidelines.pdf", controller.id);
  await prisma.resource.create({ data: { kind: "SYLLABUS", title: "General Paper Setting Guidelines", fileId: gen.id } });

  const sys = { id: controller.id, email: controller.email, role: "CONTROLLER" };
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
