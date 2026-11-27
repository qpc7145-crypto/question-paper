import { ok, route } from "@/server/core/http";
import { requireSetterWithProfile } from "@/server/auth/guard";
import { listPapers, listPaperSemesters } from "@/server/modules/papers/service";
import { listView, setterPaperView } from "@/server/modules/papers/serializers";

// Only this setter's own papers. Never other setters' drafts or upcoming papers (FR-22).
export const GET = route(async (req: Request) => {
  const u = await requireSetterWithProfile();
  const semester = new URL(req.url).searchParams.get("semester") || undefined;
  const papers = await listPapers(u, { semester }, "deadline");
  return ok({ papers: papers.map((p) => listView(setterPaperView(p))), semesters: await listPaperSemesters(u) });
});

export const dynamic = "force-dynamic";
