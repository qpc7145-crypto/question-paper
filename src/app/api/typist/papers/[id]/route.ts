import { body, fail, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { contentSchema, loadPaper, sendToCentres, updateContent } from "@/lib/papers";
import { typistPaperView } from "@/lib/serializers";

type Ctx = { params: { id: string } };

async function assigned(id: string, typistId: string) {
  const p = await loadPaper(id);
  if (p.typistId !== typistId || p.status === "ARCHIVED" || p.status === "DRAFT") return null;
  return p;
}

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser("TYPIST");
  const p = await assigned(params.id, u.id);
  if (!p) return fail(404, "Paper not found");
  return ok({ paper: typistPaperView(p) });
});

// FR-13: typist modification
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const u = await requireUser("TYPIST");
  if (!(await assigned(params.id, u.id))) return fail(404, "Paper not found");
  const input = await body(req, contentSchema);
  return ok({ paper: typistPaperView(await updateContent(params.id, u, input)) });
});

// FR-13: send to centre — only when delegated (checked in sendToCentres)
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser("TYPIST");
  if (!(await assigned(params.id, u.id))) return fail(404, "Paper not found");
  return ok({ paper: typistPaperView(await sendToCentres(params.id, u)) });
});

export const dynamic = "force-dynamic";
