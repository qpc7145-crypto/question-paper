import { ok, fail, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { centreUsage, setterPerformance } from "@/server/modules/reports/service";
import { listSemesters } from "@/server/modules/settings/service";

// GET /api/controller/reports?type=setters|centres&semester=
export const GET = route(async (req: Request) => {
  await requireUser("CONTROLLER");
  const sp = new URL(req.url).searchParams;
  const semester = sp.get("semester") || undefined;
  const type = sp.get("type");
  if (type === "setters") return ok({ rows: await setterPerformance(semester), semesters: await listSemesters() });
  if (type === "centres") return ok({ rows: await centreUsage(semester), semesters: await listSemesters() });
  return fail(400, "type must be setters or centres");
});

export const dynamic = "force-dynamic";
