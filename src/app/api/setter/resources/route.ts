import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireSetterWithProfile } from "@/lib/auth/server";
import { getCurrentSemester } from "@/lib/settings";

// FR-16 + FR-22: syllabus and model papers available to a Setter.
export const GET = route(async () => {
  const u = await requireSetterWithProfile();
  const current = await getCurrentSemester();
  const [syllabi, uploadedModels, releasedPapers] = await Promise.all([
    prisma.resource.findMany({
      where: { kind: "SYLLABUS", OR: [{ subjectId: null }, { subject: { setterId: u.id } }] },
      orderBy: { createdAt: "desc" },
      include: { subject: { select: { code: true, title: true, semester: true } }, file: { select: { sizeBytes: true } } },
    }),
    prisma.resource.findMany({
      where: { kind: "MODEL_PAPER" },
      orderBy: { createdAt: "desc" },
      include: { subject: { select: { code: true, title: true, semester: true } }, file: { select: { sizeBytes: true } } },
    }),
    // Exactly: status == USED AND semester != current AND releasedAsModel == true
    prisma.paper.findMany({
      where: { status: "USED", releasedAsModel: true, subject: { semester: { not: current } } },
      orderBy: { subject: { examDate: "desc" } },
      select: { id: true, subject: { select: { code: true, title: true, semester: true, examType: true } } },
    }),
  ]);
  const res = (r: (typeof syllabi)[number]) => ({
    id: r.id, title: r.title, semester: r.semester ?? r.subject?.semester ?? null,
    subject: r.subject ? { code: r.subject.code, title: r.subject.title } : null,
    sizeBytes: r.file.sizeBytes, createdAt: r.createdAt,
  });
  return ok({
    syllabi: syllabi.map(res),
    modelPapers: uploadedModels.map(res),
    releasedPapers: releasedPapers.map((p) => ({ paperId: p.id, ...p.subject })),
  });
});
