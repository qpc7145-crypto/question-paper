import { ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { controllerDashboard } from "@/server/modules/reports/service";

export const GET = route(async (req: Request) => {
  await requireUser("CONTROLLER");
  const semester = new URL(req.url).searchParams.get("semester") || undefined;
  return ok(await controllerDashboard(semester));
});

export const dynamic = "force-dynamic";
