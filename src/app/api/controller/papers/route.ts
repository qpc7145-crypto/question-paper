import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { listSemesters, getCurrentSemester } from "@/lib/settings";
import { controllerPaperView, paperInclude } from "@/lib/serializers";

export const GET = route(async (req: Request) => {
  await requireUser("CONTROLLER");
  const sp = new URL(req.url).searchParams;
  const semester = sp.get("semester") || undefined;
  const status = sp.get("status") || undefined;
  const papers = await prisma.paper.findMany({
    where: { status, subject: { semester } },
    include: paperInclude,
    orderBy: { subject: { examDate: "asc" } },
  });
  return ok({
    papers: papers.map((p) => {
      const v = controllerPaperView(p);
      // List view: drop heavy content fields.
      const { contentHtml: _a, sectionAHtml: _b, sectionBHtml: _c, sectionCHtml: _d, ...rest } = v;
      return rest;
    }),
    semesters: await listSemesters(),
    currentSemester: await getCurrentSemester(),
  });
});

export const dynamic = "force-dynamic";
