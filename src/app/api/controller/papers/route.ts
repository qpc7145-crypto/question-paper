import { ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { listPapers } from "@/server/modules/papers/service";
import { controllerPaperView, listView } from "@/server/modules/papers/serializers";
import { getCurrentSemester, listSemesters } from "@/server/modules/settings/service";

export const GET = route(async (req: Request) => {
  const actor = await requireUser("CONTROLLER");
  const sp = new URL(req.url).searchParams;
  const papers = await listPapers(actor, { semester: sp.get("semester") || undefined, status: sp.get("status") }, "examDate");
  return ok({
    papers: papers.map((p) => listView(controllerPaperView(p))),
    semesters: await listSemesters(),
    currentSemester: await getCurrentSemester(),
  });
});

export const dynamic = "force-dynamic";
