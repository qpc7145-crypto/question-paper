import { z } from "zod";
import { prisma } from "@/server/core/db";
import { EXAM_TYPES } from "@/lib/constants";
import type { ExamType } from "@prisma/client";
import { listSemesters } from "@/server/modules/settings/service";
import { termWhere } from "@/server/modules/academics/terms";
import { examInclude, subjectView } from "@/server/modules/papers/serializers";
import type { HandlerMap } from "./index";

const isExamType = (s: string): s is ExamType => (EXAM_TYPES as readonly string[]).includes(s);

// FR-27: subject mapping, semester mapping, result linkage. The response shapes are a
// published contract and are unchanged by the Term/Course/Exam storage model.
// Exposes exam metadata only — never paper content or any setter/centre identity.
export const resultSystemHandlers: HandlerMap = {
  "GET semesters": async () => ({ semesters: await listSemesters() }),

  "GET subjects": async ({ url }) => {
    const semester = url.searchParams.get("semester") || undefined;
    const exams = await prisma.exam.findMany({
      where: { term: termWhere(semester) },
      orderBy: { course: { code: "asc" } },
      include: { ...examInclude, paper: { select: { status: true } } },
    });
    return {
      subjects: exams.map((e) => {
        const s = subjectView(e);
        return {
          subjectId: s.id, code: s.code, title: s.title, semester: s.semester, examType: s.examType,
          examDate: s.examDate, externalRef: e.externalRef,
          examConducted: e.paper?.status === "USED" || e.paper?.status === "ARCHIVED",
        };
      }),
    };
  },

  // Link our subjects (exams) to Result-System course/result ids.
  "POST link": async ({ body }) => {
    const input = z
      .object({ mappings: z.array(z.object({ code: z.string(), semester: z.string(), examType: z.string(), externalRef: z.string().max(100) })).max(1000) })
      .parse(body);
    let linked = 0;
    const missing: string[] = [];
    for (const m of input.mappings) {
      const key = `${m.code}/${m.semester}/${m.examType}`;
      if (!isExamType(m.examType)) {
        missing.push(key);
        continue;
      }
      const r = await prisma.exam.updateMany({
        where: { course: { code: m.code.toUpperCase() }, term: termWhere(m.semester), examType: m.examType },
        data: { externalRef: m.externalRef },
      });
      if (r.count) linked++;
      else missing.push(key);
    }
    return { linked, missing };
  },
};
