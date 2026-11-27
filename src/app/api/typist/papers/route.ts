import { ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { listPapers } from "@/server/modules/papers/service";
import { listView, subjectView, typistPaperView } from "@/server/modules/papers/serializers";

// Typist sees only papers assigned to them, never the setter identity (FR-14).
export const GET = route(async (req: Request) => {
  const u = await requireUser("TYPIST");
  const semester = new URL(req.url).searchParams.get("semester") || undefined;
  const papers = await listPapers(u, { semester }, "examDate");
  const semesters = Array.from(new Set(papers.map((p) => subjectView(p.exam).semester)));
  return ok({ papers: papers.map((p) => listView(typistPaperView(p))), semesters });
});

export const dynamic = "force-dynamic";
