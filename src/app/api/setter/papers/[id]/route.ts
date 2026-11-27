import { body, ok, route } from "@/server/core/http";
import { requireSetterWithProfile } from "@/server/auth/guard";
import { contentSchema, getPaper, submitPaper, updateContent } from "@/server/modules/papers/service";
import { setterPaperView } from "@/server/modules/papers/serializers";

type Ctx = { params: { id: string } };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireSetterWithProfile();
  return ok({ paper: setterPaperView(await getPaper(u, params.id)) });
});

// FR-10 save draft
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const u = await requireSetterWithProfile();
  const input = await body(req, contentSchema);
  return ok({ paper: setterPaperView(await updateContent(u, params.id, input)) });
});

// FR-11 submit final
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireSetterWithProfile();
  return ok({ paper: setterPaperView(await submitPaper(u, params.id)) });
});

export const dynamic = "force-dynamic";
