import { ok, route } from "@/server/core/http";
import { requireCentreUser } from "@/server/auth/guard";
import { centreSchedule } from "@/server/modules/distribution/service";
import { centreAssignmentView } from "@/server/modules/papers/serializers";

// Centre sees exam schedule for its own centre only — no setter/typist identity, no content.
export const GET = route(async () => {
  const u = await requireCentreUser();
  const now = new Date();
  const { centre, assignments } = await centreSchedule(u.centreId);
  return ok({ centre, serverNow: now, papers: assignments.map((a) => centreAssignmentView(a, now)) });
});

export const dynamic = "force-dynamic";
