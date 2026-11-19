import { z } from "zod";
import { prisma } from "@/lib/db";
import { listSemesters } from "@/lib/settings";
import type { HandlerMap } from "./index";

// FR-27: subject mapping, semester mapping, result linkage.
// Exposes exam metadata only — never paper content or any setter/centre identity.
export const resultSystemHandlers: HandlerMap = {
  "GET semesters": async () => ({ semesters: await listSemesters() }),

  "GET subjects": async ({ url }) => {
    const semester = url.searchParams.get("semester") || undefined;
    const subjects = await prisma.subject.findMany({
      where: { semester },
      orderBy: { code: "asc" },
      select: { id: true, code: true, title: true, semester: true, examType: true, examDate: true, externalRef: true, paper: { select: { status: true } } },
    });
    return {
      subjects: subjects.map((s) => ({
        subjectId: s.id, code: s.code, title: s.title, semester: s.semester, examType: s.examType,
        examDate: s.examDate, externalRef: s.externalRef,
        examConducted: s.paper?.status === "USED" || s.paper?.status === "ARCHIVED",
      })),
    };
  },

  // Link our subjects to Result-System course/result ids.
  "POST link": async ({ body }) => {
    const input = z
      .object({ mappings: z.array(z.object({ code: z.string(), semester: z.string(), examType: z.string(), externalRef: z.string().max(100) })).max(1000) })
      .parse(body);
    let linked = 0;
    const missing: string[] = [];
    for (const m of input.mappings) {
      const r = await prisma.subject.updateMany({
        where: { code: m.code.toUpperCase(), semester: m.semester, examType: m.examType },
        data: { externalRef: m.externalRef },
      });
      if (r.count) linked++;
      else missing.push(`${m.code}/${m.semester}/${m.examType}`);
    }
    return { linked, missing };
  },
};
