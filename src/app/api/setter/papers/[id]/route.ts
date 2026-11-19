import { body, fail, ok, route } from "@/lib/http";
import { requireSetterWithProfile } from "@/lib/auth/server";
import { contentSchema, loadPaper, submitPaper, updateContent } from "@/lib/papers";
import { setterPaperView } from "@/lib/serializers";

type Ctx = { params: { id: string } };

async function ownPaper(id: string, setterId: string) {
  const p = await loadPaper(id);
  if (p.setterId !== setterId || p.status === "ARCHIVED") return null;
  return p;
}

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireSetterWithProfile();
  const p = await ownPaper(params.id, u.id);
  if (!p) return fail(404, "Paper not found");
  return ok({ paper: setterPaperView(p) });
});

// FR-10 save draft
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const u = await requireSetterWithProfile();
  if (!(await ownPaper(params.id, u.id))) return fail(404, "Paper not found");
  const input = await body(req, contentSchema);
  const p = await updateContent(params.id, u, input);
  return ok({ paper: setterPaperView(p) });
});

// FR-11 submit final
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireSetterWithProfile();
  if (!(await ownPaper(params.id, u.id))) return fail(404, "Paper not found");
  const p = await submitPaper(params.id, u);
  return ok({ paper: setterPaperView(p) });
});
