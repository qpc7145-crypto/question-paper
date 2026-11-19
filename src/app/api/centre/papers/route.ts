import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireCentreUser } from "@/lib/auth/server";
import { centreAssignmentView } from "@/lib/serializers";

// Centre sees exam schedule for its own centre only — no setter/typist identity, no content.
export const GET = route(async () => {
  const u = await requireCentreUser();
  const now = new Date();
  const [centre, assignments] = await Promise.all([
    prisma.centre.findUniqueOrThrow({ where: { id: u.centreId }, select: { code: true, name: true, city: true } }),
    prisma.paperCentre.findMany({
      where: { centreId: u.centreId, paper: { status: { in: ["SENT_TO_CENTRE", "USED"] } } },
      include: { paper: { include: { subject: true } } },
      orderBy: { availableFrom: "asc" },
    }),
  ]);
  return ok({ centre, serverNow: now, papers: assignments.map((a) => centreAssignmentView(a, now)) });
});
