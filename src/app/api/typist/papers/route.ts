import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { paperInclude, typistPaperView } from "@/lib/serializers";

// Typist sees only papers assigned to them, never the setter identity (FR-14).
export const GET = route(async (req: Request) => {
  const u = await requireUser("TYPIST");
  const semester = new URL(req.url).searchParams.get("semester") || undefined;
  const papers = await prisma.paper.findMany({
    where: { typistId: u.id, status: { not: "ARCHIVED" }, subject: { semester } },
    include: paperInclude,
    orderBy: { subject: { examDate: "asc" } },
  });
  const semesters = Array.from(new Set(papers.map((p) => p.subject.semester)));
  return ok({
    papers: papers.map((p) => {
      const { contentHtml: _a, sectionAHtml: _b, sectionBHtml: _c, sectionCHtml: _d, ...rest } = typistPaperView(p);
      return rest;
    }),
    semesters,
  });
});
