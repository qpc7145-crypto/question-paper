import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { contentSchema, controllerPaperDetail, updateContent } from "@/server/modules/papers/service";
import { controllerPaperView } from "@/server/modules/papers/serializers";

type Ctx = { params: { id: string } };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  const { paper, ...rest } = await controllerPaperDetail(actor, params.id);
  return ok({ paper: controllerPaperView(paper), ...rest });
});

// FR-12: Controller may edit a submitted paper.
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  const input = await body(req, contentSchema);
  return ok({ paper: controllerPaperView(await updateContent(actor, params.id, input)) });
});

export const dynamic = "force-dynamic";
