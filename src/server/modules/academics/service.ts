import type { z } from "zod";
import { prisma, withTx, type Tx } from "@/server/core/db";
import { HttpError } from "@/server/core/http";
import { writeAudit } from "@/server/modules/audit/service";
import type { Actor } from "@/server/policy";
import { listSemesters } from "@/server/modules/settings/service";
import { startDraft } from "@/server/modules/papers/service";
import { examInclude, subjectView } from "@/server/modules/papers/serializers";
import { ensureTerm, termWhere } from "./terms";
import { subjectPatchSchema, subjectSchema } from "./schema";

// The API calls an exam a "subject": { id, code, title, semester, examType, dates, setter, paper }.

const ACTIVE_SETTER = { where: { role: "SETTER" as const, revokedAt: null }, include: { user: { select: { id: true, displayName: true, email: true } } } };

// FR-4: a setter can only be given a subject once their bio-data is on file.
async function assertAssignableSetter(db: Tx, id: string) {
  const s = await db.user.findUnique({ where: { id }, include: { setterProfile: { select: { userId: true } } } });
  if (!s || s.role !== "SETTER" || !s.isActive) throw new HttpError(409, "Selected setter is not an active Paper Setter");
  if (!s.setterProfile) throw new HttpError(409, "This setter has not completed their bio-data yet and cannot be assigned a subject");
}

export async function listSubjects(semester?: string) {
  const exams = await prisma.exam.findMany({
    where: { term: termWhere(semester) },
    orderBy: [{ examDate: "asc" }],
    include: { ...examInclude, paper: { select: { id: true, status: true, assignments: ACTIVE_SETTER } } },
  });
  return {
    subjects: exams.map((e) => {
      const setter = e.paper?.assignments[0]?.user ?? null;
      return {
        ...subjectView(e),
        externalRef: e.externalRef,
        createdAt: e.createdAt,
        setterId: setter?.id ?? null,
        setter,
        // A paper whose setter was unassigned is kept (with its history) but not shown.
        paper: e.paper && setter ? { id: e.paper.id, status: e.paper.status } : null,
      };
    }),
    semesters: await listSemesters(),
  };
}

// Assigns a setter to an exam's paper: creates the paper on first assignment, otherwise
// revokes the previous setter and starts a fresh draft (the old draft stays in history).
async function assignSetter(tx: Tx, actor: Actor, examId: string, setterId: string | null) {
  const paper = await tx.paper.findUnique({ where: { examId } });
  const now = new Date();
  if (paper) {
    await tx.$queryRaw`SELECT 1 FROM "Paper" WHERE "id" = ${paper.id} FOR UPDATE`;
    await tx.paperAssignment.updateMany({ where: { paperId: paper.id, role: "SETTER", revokedAt: null }, data: { revokedAt: now } });
  }
  if (!setterId) return;
  const p = paper ?? (await tx.paper.create({ data: { examId } }));
  await tx.paperAssignment.create({ data: { paperId: p.id, userId: setterId, role: "SETTER", assignedById: actor.id } });
  await startDraft(tx, p.id, setterId);
}

// FR-6: create subject; optional FR-7 setter assignment creates the paper draft.
export function createSubject(actor: Actor, input: z.output<typeof subjectSchema>) {
  return withTx(async (tx) => {
    if (input.setterId) await assertAssignableSetter(tx, input.setterId);
    const term = await ensureTerm(tx, input.semester);
    const course = await tx.course.upsert({
      where: { code: input.code },
      update: { title: input.title }, // the course title follows its latest exam
      create: { code: input.code, title: input.title },
    });
    const dup = await tx.exam.findUnique({ where: { courseId_termId_examType: { courseId: course.id, termId: term.id, examType: input.examType } } });
    if (dup) throw new HttpError(409, "This subject already exists for that semester and exam type");
    const exam = await tx.exam.create({
      data: { courseId: course.id, termId: term.id, examType: input.examType, title: input.title, examDate: input.examDate, submissionDeadline: input.submissionDeadline },
      include: examInclude,
    });
    if (input.setterId) await assignSetter(tx, actor, exam.id, input.setterId);
    await writeAudit(tx, { actor, action: "SUBJECT_CREATED", entity: "Subject", entityId: exam.id, details: { code: input.code, semester: input.semester } });
    if (input.setterId) {
      await writeAudit(tx, { actor, action: "SETTER_ASSIGNED", entity: "Subject", entityId: exam.id, details: { setterId: input.setterId } });
    }
    return { ...subjectView(exam), setterId: input.setterId ?? null };
  });
}

// FR-6 / FR-7: update subject details and (re)assign the Setter.
export function updateSubject(actor: Actor, id: string, input: z.output<typeof subjectPatchSchema>) {
  return withTx(async (tx) => {
    const exam = await tx.exam.findUnique({ where: { id }, include: { paper: { include: { assignments: ACTIVE_SETTER } } } });
    if (!exam) throw new HttpError(404, "Subject not found");
    if (exam.paper) await tx.$queryRaw`SELECT 1 FROM "Paper" WHERE "id" = ${exam.paper.id} FOR UPDATE`;

    const examDate = input.examDate ?? exam.examDate;
    const deadline = input.submissionDeadline ?? exam.submissionDeadline;
    if (deadline >= examDate) throw new HttpError(400, "Submission deadline must be before the exam date");

    const currentSetterId = exam.paper?.assignments[0]?.userId ?? null;
    const { setterId, ...rest } = input;
    const setterChanged = setterId !== undefined && setterId !== currentSetterId;
    if (setterChanged) {
      if (exam.paper && currentSetterId && exam.paper.status !== "DRAFT") {
        throw new HttpError(409, "Setter cannot be changed after the paper has been submitted");
      }
      if (setterId) await assertAssignableSetter(tx, setterId);
    }

    const updated = await tx.exam.update({ where: { id }, data: rest, include: examInclude });
    if (setterChanged) await assignSetter(tx, actor, id, setterId);
    // Keep each centre's unlock time in sync when the exam is rescheduled.
    if (input.examDate && exam.paper) {
      await tx.paperCentre.updateMany({
        where: { paperId: exam.paper.id, availableFrom: exam.examDate, downloadCount: 0 },
        data: { availableFrom: input.examDate },
      });
    }
    await writeAudit(tx, { actor, action: "SUBJECT_UPDATED", entity: "Subject", entityId: id, details: { ...rest } });
    if (setterChanged) {
      await writeAudit(tx, { actor, action: "SETTER_ASSIGNED", entity: "Subject", entityId: id, details: { from: currentSetterId, to: setterId } });
    }
    return { ...subjectView(updated), setterId: setterChanged ? setterId : currentSetterId };
  });
}
