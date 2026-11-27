import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { centrePatchSchema, updateCentre } from "@/server/modules/centres/service";

type Ctx = { params: { id: string } };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  return ok({ centre: await updateCentre(actor, params.id, await body(req, centrePatchSchema)) });
});

export const dynamic = "force-dynamic";
