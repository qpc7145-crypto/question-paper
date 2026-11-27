import { ok, route } from "@/server/core/http";
import { requireSetterWithProfile } from "@/server/auth/guard";
import { setterResources } from "@/server/modules/resources/service";

// FR-16 + FR-22: syllabus and model papers available to a Setter.
export const GET = route(async () => {
  const u = await requireSetterWithProfile();
  return ok(await setterResources(u));
});

export const dynamic = "force-dynamic";
