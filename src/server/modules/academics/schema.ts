import { z } from "zod";
import { EXAM_TYPES } from "@/lib/constants";
import { isValidSemester, SEMESTER_HINT, semesterYear } from "@/lib/semesters";

export const subjectSchema = z
  .object({
    code: z.string().min(2).max(30).transform((s) => s.trim().toUpperCase()),
    title: z.string().min(2).max(200),
    semester: z
      .string()
      .transform((s) => s.trim().replace(/\s+/g, " "))
      .refine((s) => isValidSemester(s), {
        message: `Semester must be ${SEMESTER_HINT.toLowerCase()}, with a year from 2000 to five years ahead`,
      }),
    examType: z.enum(EXAM_TYPES),
    examDate: z.coerce.date(),
    submissionDeadline: z.coerce.date(),
    setterId: z.string().nullable().optional(),
  })
  .refine((s) => Math.abs(semesterYear(s.semester) - s.examDate.getFullYear()) <= 1, {
    message: "The exam date must fall in or next to the semester's year",
    path: ["examDate"],
  })
  .refine((s) => s.submissionDeadline < s.examDate, {
    message: "Submission deadline must be before the exam date",
    path: ["submissionDeadline"],
  });

export const subjectPatchSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  examType: z.enum(EXAM_TYPES).optional(),
  examDate: z.coerce.date().optional(),
  submissionDeadline: z.coerce.date().optional(),
  setterId: z.string().nullable().optional(),
});
