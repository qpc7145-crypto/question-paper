import { ok, fail, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { centreUsage, setterPerformance } from "@/lib/reports";
import { listSemesters } from "@/lib/settings";

// GET /api/controller/reports?type=setters|centres&semester=
export const GET = route(async (req: Request) => {
  await requireUser("CONTROLLER");
  const sp = new URL(req.url).searchParams;
  const semester = sp.get("semester") || undefined;
  const type = sp.get("type");
  const semesters = await listSemesters();
  if (type === "setters") return ok({ rows: await setterPerformance(semester), semesters });
  if (type === "centres") return ok({ rows: await centreUsage(semester), semesters });
  return fail(400, "type must be setters or centres");
});

export const dynamic = "force-dynamic";
