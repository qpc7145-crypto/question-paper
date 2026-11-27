import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { updateUserSchema } from "@/server/modules/users/schema";
import { getUser, updateUser } from "@/server/modules/users/service";

type Ctx = { params: { id: string } };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  await requireUser("CONTROLLER");
  return ok({ user: await getUser(params.id) });
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  await updateUser(actor, params.id, await body(req, updateUserSchema));
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
