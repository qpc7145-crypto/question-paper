import { z } from "zod";
import { prisma } from "@/lib/db";
import { EXAM_TYPES } from "@/lib/constants";
import { SEMESTER_HINT, SEMESTER_RE } from "@/lib/semesters";

export const subjectSchema = z
  .object({
    code: z.string().min(2).max(30).transform((s) => s.trim().toUpperCase()),
    title: z.string().min(2).max(200),
    semester: z
      .string()
      .transform((s) => s.trim().replace(/\s+/g, " "))
      .refine((s) => SEMESTER_RE.test(s), { message: `Semester must be ${SEMESTER_HINT.toLowerCase()}` }),
    examType: z.enum(EXAM_TYPES),
    examDate: z.coerce.date(),
    submissionDeadline: z.coerce.date(),
    setterId: z.string().nullable().optional(),
  })
  .refine((s) => s.submissionDeadline < s.examDate, {
    message: "Submission deadline must be before the exam date",
    path: ["submissionDeadline"],
  });

// FR-4: a setter can only be given a subject once their bio-data is on file.
// Returns an error message, or null when the setter can be assigned.
export async function setterAssignError(id: string) {
  const s = await prisma.user.findUnique({ where: { id }, include: { setterProfile: { select: { userId: true } } } });
  if (!s || s.role !== "SETTER" || !s.isActive) return "Selected setter is not an active Paper Setter";
  if (!s.setterProfile) return "This setter has not completed their bio-data yet and cannot be assigned a subject";
  return null;
}
