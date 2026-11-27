import { fail, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { attachFile } from "@/server/modules/papers/service";
import { viewFor } from "@/server/modules/papers/serializers";

type Ctx = { params: { id: string } };

// FR-8 / FR-13: upload PDF/Word for a paper (Setter: own draft; Typist: assigned; Controller: any).
export const POST = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("SETTER", "TYPIST", "CONTROLLER");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "No file uploaded");
  return ok({ paper: viewFor(actor.role, await attachFile(actor, params.id, file)) });
});

export const dynamic = "force-dynamic";
