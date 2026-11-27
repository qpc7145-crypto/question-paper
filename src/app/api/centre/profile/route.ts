import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { superintendentSchema } from "@/server/modules/users/schema";
import { getOwnCentreProfile, saveSuperintendentProfile } from "@/server/modules/users/service";

// FR-5: Centre Superintendent bio-data maintained via system entry form.

export const GET = route(async () => {
  const u = await requireUser("SUPERINTENDENT");
  return ok({ ...(await getOwnCentreProfile(u)), email: u.email });
});

export const PUT = route(async (req: Request) => {
  const u = await requireUser("SUPERINTENDENT");
  await saveSuperintendentProfile(u, u.id, await body(req, superintendentSchema));
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
