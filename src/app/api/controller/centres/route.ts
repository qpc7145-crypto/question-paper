import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { centreSchema, createCentre, listCentres } from "@/server/modules/centres/service";

export const GET = route(async () => {
  await requireUser("CONTROLLER");
  return ok(await listCentres());
});

export const POST = route(async (req: Request) => {
  const actor = await requireUser("CONTROLLER");
  return ok({ centre: await createCentre(actor, await body(req, centreSchema)) }, 201);
});

export const dynamic = "force-dynamic";
