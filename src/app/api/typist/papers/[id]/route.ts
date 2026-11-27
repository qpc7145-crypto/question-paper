import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { contentSchema, getPaper, sendToCentres, updateContent } from "@/server/modules/papers/service";
import { typistPaperView } from "@/server/modules/papers/serializers";

type Ctx = { params: { id: string } };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser("TYPIST");
  return ok({ paper: typistPaperView(await getPaper(u, params.id)) });
});

// FR-13: typist modification
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const u = await requireUser("TYPIST");
  const input = await body(req, contentSchema);
  return ok({ paper: typistPaperView(await updateContent(u, params.id, input)) });
});

// FR-13: send to centre — only when delegated (policy.assertCanSend)
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser("TYPIST");
  return ok({ paper: typistPaperView(await sendToCentres(u, params.id)) });
});

export const dynamic = "force-dynamic";
