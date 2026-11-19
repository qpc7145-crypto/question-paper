import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireSetterWithProfile } from "@/lib/auth/server";
import { paperInclude, setterPaperView } from "@/lib/serializers";

// Only this setter's own papers. Never other setters' drafts or upcoming papers (FR-22).
export const GET = route(async (req: Request) => {
  const u = await requireSetterWithProfile();
  const semester = new URL(req.url).searchParams.get("semester") || undefined;
  const papers = await prisma.paper.findMany({
    where: { setterId: u.id, subject: { semester } },
    include: paperInclude,
    orderBy: { subject: { submissionDeadline: "asc" } },
  });
  const semesters = Array.from(
    new Set((await prisma.subject.findMany({ where: { setterId: u.id }, select: { semester: true } })).map((s) => s.semester)),
  );
  return ok({
    papers: papers.map((p) => {
      const { contentHtml: _a, sectionAHtml: _b, sectionBHtml: _c, sectionCHtml: _d, ...rest } = setterPaperView(p);
      return rest;
    }),
    semesters,
  });
});

export const dynamic = "force-dynamic";
