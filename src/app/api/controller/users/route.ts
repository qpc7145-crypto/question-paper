import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { createUserSchema } from "@/server/modules/users/schema";
import { createUser, listUsers } from "@/server/modules/users/service";

export const GET = route(async (req: Request) => {
  await requireUser("CONTROLLER");
  return ok({ users: await listUsers(new URL(req.url).searchParams.get("role")) });
});

export const POST = route(async (req: Request) => {
  const actor = await requireUser("CONTROLLER");
  return ok(await createUser(actor, await body(req, createUserSchema)), 201);
});

export const dynamic = "force-dynamic";
