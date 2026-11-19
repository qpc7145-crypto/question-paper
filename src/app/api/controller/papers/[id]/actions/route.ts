import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, fail, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { assertTransition } from "@/lib/lifecycle";
import { loadPaper, sendToCentres } from "@/lib/papers";
import { controllerPaperView } from "@/lib/serializers";
import { getCurrentSemester } from "@/lib/settings";

type Ctx = { params: { id: string } };

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assignTypist"), typistId: z.string().nullable(), canSend: z.boolean() }),
  z.object({
    action: z.literal("setCentres"),
    centres: z.array(z.object({ centreId: z.string(), availableFrom: z.coerce.date().optional() })).max(200),
  }),
  z.object({ action: z.literal("send") }),
  z.object({ action: z.literal("recall") }),
  z.object({ action: z.literal("archive") }),
  z.object({ action: z.literal("releaseModel"), released: z.boolean() }),
]);

export const POST = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  const input = await body(req, actionSchema);
  const p = await loadPaper(params.id);
  if (p.status === "ARCHIVED") return fail(423, "Archived papers are permanently locked");

  switch (input.action) {
    // FR-7 + FR-13 delegation
    case "assignTypist": {
      if (input.typistId) {
        const t = await prisma.user.findUnique({ where: { id: input.typistId } });
        if (!t || t.role !== "TYPIST" || !t.isActive) return fail(400, "Selected user is not an active Typist");
      }
      if (p.status === "USED") return fail(423, "Paper is locked after use");
      await prisma.paper.update({
        where: { id: p.id },
        data: { typistId: input.typistId, typistCanSend: input.typistId ? input.canSend : false },
      });
      if (input.typistId !== p.typistId) {
        await audit({ actor, action: "TYPIST_ASSIGNED", entity: "Paper", entityId: p.id, details: { from: p.typistId, to: input.typistId } });
      }
      if ((input.typistId ? input.canSend : false) !== p.typistCanSend) {
        await audit({ actor, action: "DELEGATION_CHANGED", entity: "Paper", entityId: p.id, details: { typistId: input.typistId, canSendToCentre: input.canSend } });
      }
      break;
    }
    // FR-17 multi-centre
    case "setCentres": {
      if (p.status === "USED") return fail(423, "Paper is locked after use");
      const ids = Array.from(new Set(input.centres.map((c) => c.centreId)));
      const found = await prisma.centre.count({ where: { id: { in: ids } } });
      if (found !== ids.length) return fail(400, "One or more centres do not exist");
      const removed = p.centres.filter((c) => !ids.includes(c.centreId));
      if (removed.some((c) => c.downloadCount > 0)) return fail(409, "A centre that already downloaded the paper cannot be removed");
      await prisma.$transaction([
        prisma.paperCentre.deleteMany({ where: { paperId: p.id, centreId: { in: removed.map((r) => r.centreId) } } }),
        ...input.centres.map((c) =>
          prisma.paperCentre.upsert({
            where: { paperId_centreId: { paperId: p.id, centreId: c.centreId } },
            update: { availableFrom: c.availableFrom ?? p.subject.examDate },
            create: { paperId: p.id, centreId: c.centreId, availableFrom: c.availableFrom ?? p.subject.examDate },
          }),
        ),
      ]);
      await audit({ actor, action: "CENTRES_ASSIGNED", entity: "Paper", entityId: p.id, details: { centreIds: ids } });
      break;
    }
    case "send":
      await sendToCentres(p.id, actor);
      break;
    case "recall": {
      assertTransition(p.status, "UNDER_MODIFICATION");
      if (p.centres.some((c) => c.firstAccessAt || c.downloadCount > 0)) return fail(409, "A centre has already accessed this paper");
      await prisma.paper.update({ where: { id: p.id }, data: { status: "UNDER_MODIFICATION", sentAt: null } });
      await audit({ actor, action: "PAPER_RECALLED", entity: "Paper", entityId: p.id });
      break;
    }
    // FR-21
    case "archive": {
      assertTransition(p.status, "ARCHIVED");
      await prisma.paper.update({ where: { id: p.id }, data: { status: "ARCHIVED", archivedAt: new Date(), releasedAsModel: false } });
      await audit({ actor, action: "PAPER_ARCHIVED", entity: "Paper", entityId: p.id, details: { subject: p.subject.code } });
      break;
    }
    // FR-22
    case "releaseModel": {
      if (p.status !== "USED") return fail(409, "Only USED papers can be released as model papers");
      const current = await getCurrentSemester();
      if (input.released && p.subject.semester === current) {
        return fail(409, "Papers from the current semester cannot be released as model papers");
      }
      await prisma.paper.update({ where: { id: p.id }, data: { releasedAsModel: input.released } });
      await audit({ actor, action: "MODEL_RELEASE_CHANGED", entity: "Paper", entityId: p.id, details: { released: input.released } });
      break;
    }
  }
  return ok({ paper: controllerPaperView(await loadPaper(p.id)) });
});
