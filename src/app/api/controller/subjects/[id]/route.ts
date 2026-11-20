import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, fail, notFound, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { EXAM_TYPES } from "@/lib/constants";
import { setterAssignError } from "@/lib/subjects";

type Ctx = { params: { id: string } };

const patchSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  examType: z.enum(EXAM_TYPES).optional(),
  examDate: z.coerce.date().optional(),
  submissionDeadline: z.coerce.date().optional(),
  setterId: z.string().nullable().optional(),
});

// FR-6 / FR-7: update subject details and (re)assign the Setter.
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  const input = await body(req, patchSchema);
  const subject = await prisma.subject.findUnique({ where: { id: params.id }, include: { paper: true } });
  if (!subject) notFound("Subject");

  const examDate = input.examDate ?? subject.examDate;
  const deadline = input.submissionDeadline ?? subject.submissionDeadline;
  if (deadline >= examDate) return fail(400, "Submission deadline must be before the exam date");

  if (input.setterId !== undefined && input.setterId !== subject.setterId) {
    if (subject.paper && subject.paper.status !== "DRAFT") {
      return fail(409, "Setter cannot be changed after the paper has been submitted");
    }
    const setterErr = input.setterId ? await setterAssignError(input.setterId) : null;
    if (setterErr) return fail(409, setterErr);
  }

  const { setterId, ...rest } = input;
  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.subject.update({
      where: { id: subject.id },
      data: { ...rest, ...(setterId !== undefined && { setterId }) },
    });
    if (setterId !== undefined && setterId !== subject.setterId) {
      if (setterId && subject.paper) {
        // Re-assigning a draft: start a fresh draft for the new setter.
        await tx.paper.update({
          where: { id: subject.paper.id },
          data: { setterId, contentHtml: "", sectionAHtml: "", sectionBHtml: "", sectionCHtml: "", fileId: null, format: "RICH_TEXT" },
        });
      } else if (setterId) {
        await tx.paper.create({ data: { subjectId: subject.id, setterId } });
      } else if (subject.paper) {
        await tx.paper.delete({ where: { id: subject.paper.id } });
      }
    }
    // Keep each centre's unlock time in sync when the exam is rescheduled.
    if (input.examDate && subject.paper) {
      await tx.paperCentre.updateMany({
        where: { paperId: subject.paper.id, availableFrom: subject.examDate, downloadCount: 0 },
        data: { availableFrom: input.examDate },
      });
    }
    return s;
  });

  await audit({ actor, action: "SUBJECT_UPDATED", entity: "Subject", entityId: subject.id, details: { ...rest } });
  if (setterId !== undefined && setterId !== subject.setterId) {
    await audit({ actor, action: "SETTER_ASSIGNED", entity: "Subject", entityId: subject.id, details: { from: subject.setterId, to: setterId } });
  }
  return ok({ subject: updated });
});

export const dynamic = "force-dynamic";
