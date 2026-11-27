import { body, ok, route } from "@/server/core/http";
import { issueSession, requireUser } from "@/server/auth/guard";
import { setterBiodataSchema } from "@/server/modules/users/schema";
import { getSessionRecord, getSetterProfile, saveSetterProfile } from "@/server/modules/users/service";

// FR-4 mandatory Setter bio-data.
export const GET = route(async () => {
  const u = await requireUser("SETTER");
  return ok({ profile: await getSetterProfile(u.id), email: u.email });
});

export const PUT = route(async (req: Request) => {
  const u = await requireUser("SETTER");
  const firstCompletion = await saveSetterProfile(u, await body(req, setterBiodataSchema));
  if (firstCompletion) await issueSession(await getSessionRecord(u.id), true); // lift the FR-4 gate in the token
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
