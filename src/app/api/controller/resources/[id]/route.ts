import { ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { deleteResource } from "@/server/modules/resources/service";

type Ctx = { params: { id: string } };

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  await deleteResource(actor, params.id);
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
