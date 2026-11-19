import { z } from "zod";
import { prisma } from "@/lib/db";
import { EXAM_TYPES } from "@/lib/constants";

export const subjectSchema = z
  .object({
    code: z.string().min(2).max(30).transform((s) => s.trim().toUpperCase()),
    title: z.string().min(2).max(200),
    semester: z.string().min(3).max(40).transform((s) => s.trim()),
    examType: z.enum(EXAM_TYPES),
    examDate: z.coerce.date(),
    submissionDeadline: z.coerce.date(),
    setterId: z.string().nullable().optional(),
  })
  .refine((s) => s.submissionDeadline < s.examDate, {
    message: "Submission deadline must be before the exam date",
    path: ["submissionDeadline"],
  });

export async function isActiveSetter(id: string) {
  const s = await prisma.user.findUnique({ where: { id } });
  return !!s && s.role === "SETTER" && s.isActive;
}
