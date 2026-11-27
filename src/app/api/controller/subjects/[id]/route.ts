import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { updateSubject } from "@/server/modules/academics/service";
import { subjectPatchSchema } from "@/server/modules/academics/schema";

type Ctx = { params: { id: string } };

// FR-6 / FR-7: update subject details and (re)assign the Setter.
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  return ok({ subject: await updateSubject(actor, params.id, await body(req, subjectPatchSchema)) });
});

export const dynamic = "force-dynamic";
