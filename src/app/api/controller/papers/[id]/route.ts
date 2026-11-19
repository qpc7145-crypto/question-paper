import { prisma } from "@/lib/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { contentSchema, loadPaper, updateContent } from "@/lib/papers";
import { controllerPaperView } from "@/lib/serializers";
import { getCurrentSemester } from "@/lib/settings";

type Ctx = { params: { id: string } };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  await requireUser("CONTROLLER");
  const p = await loadPaper(params.id);
  const [revisions, accessLogs, typists, centres] = await Promise.all([
    prisma.paperRevision.findMany({
      where: { paperId: p.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, editorRole: true, note: true, createdAt: true, editor: { select: { displayName: true } } },
    }),
    prisma.accessLog.findMany({
      where: { paperId: p.id },
      orderBy: { at: "desc" },
      take: 200,
      select: { id: true, kind: true, at: true, ip: true, centre: { select: { code: true, name: true } } },
    }),
    prisma.user.findMany({ where: { role: "TYPIST", isActive: true }, select: { id: true, displayName: true, email: true } }),
    prisma.centre.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true, city: true } }),
  ]);
  return ok({
    paper: controllerPaperView(p),
    revisions,
    accessLogs,
    options: { typists, centres },
    currentSemester: await getCurrentSemester(),
  });
});

// FR-12: Controller may edit a submitted paper.
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  const input = await body(req, contentSchema);
  const p = await updateContent(params.id, actor, input);
  return ok({ paper: controllerPaperView(p) });
});

export const dynamic = "force-dynamic";
