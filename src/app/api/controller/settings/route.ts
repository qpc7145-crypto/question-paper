import { z } from "zod";
import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { getCurrentSemester, getInstitutionName, listSemesters, updateSettings } from "@/server/modules/settings/service";

export const GET = route(async () => {
  await requireUser("CONTROLLER");
  return ok({
    currentSemester: await getCurrentSemester(),
    institutionName: await getInstitutionName(),
    semesters: await listSemesters(),
  });
});

export const PUT = route(async (req: Request) => {
  const actor = await requireUser("CONTROLLER");
  const input = await body(req, z.object({ currentSemester: z.string().min(3).max(40), institutionName: z.string().min(2).max(200) }));
  await updateSettings(actor, input);
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
