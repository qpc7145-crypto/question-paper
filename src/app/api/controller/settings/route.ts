import { z } from "zod";
import { audit } from "@/lib/audit";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { getCurrentSemester, getInstitutionName, listSemesters, setSetting, SETTING_KEYS } from "@/lib/settings";

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
  const input = await body(
    req,
    z.object({ currentSemester: z.string().min(3).max(40), institutionName: z.string().min(2).max(200) }),
  );
  await setSetting(SETTING_KEYS.currentSemester, input.currentSemester.trim());
  await setSetting(SETTING_KEYS.institutionName, input.institutionName.trim());
  await audit({ actor, action: "SETTINGS_UPDATED", details: input });
  return ok({ ok: true });
});
