import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { superintendentSchema } from "@/server/modules/users/schema";
import { saveSuperintendentProfile } from "@/server/modules/users/service";

type Ctx = { params: { id: string } };

// FR-5: the Controller can enter or correct a Centre Superintendent's bio-data.
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  await saveSuperintendentProfile(actor, params.id, await body(req, superintendentSchema));
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
