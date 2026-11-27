import { prisma, withTx, lockPaper } from "@/server/core/db";
import { HttpError } from "@/server/core/http";
import { writeAudit } from "@/server/modules/audit/service";
import { centreAssignmentScope, type Actor } from "@/server/policy";
import { controllerCommand } from "@/server/modules/papers/service";
import { centreAssignmentInclude, paperInclude, sentState } from "@/server/modules/papers/serializers";
import { unlockTimeError } from "@/lib/semesters";

// FR-17 multi-centre distribution + FR-18 unlock times.
export function setCentres(actor: Actor, paperId: string, centres: { centreId: string; availableFrom?: Date }[]) {
  return controllerCommand(actor, paperId, async (tx, p) => {
    if (p.status === "USED") throw new HttpError(423, "Paper is locked after use");
    const examDate = p.exam.examDate;
    const ids = Array.from(new Set(centres.map((c) => c.centreId)));
    const found = await tx.centre.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } });
    if (found.length !== ids.length) throw new HttpError(400, "One or more centres do not exist");
    const codeOf = new Map(found.map((c) => [c.id, c.code]));
    // A new or changed unlock time must be in the future and close to the exam start.
    const nowMs = Date.now();
    for (const c of centres) {
      const when = c.availableFrom ?? examDate;
      const prev = p.centres.find((x) => x.centreId === c.centreId);
      if (prev && prev.availableFrom.getTime() === when.getTime()) continue;
      const err = unlockTimeError(when, examDate, codeOf.get(c.centreId) ?? c.centreId, nowMs);
      if (err) throw new HttpError(400, err);
    }
    const removed = p.centres.filter((c) => !ids.includes(c.centreId));
    if (removed.some((c) => c.downloadCount > 0)) throw new HttpError(409, "A centre that already downloaded the paper cannot be removed");
    await tx.paperCentre.deleteMany({ where: { paperId: p.id, centreId: { in: removed.map((r) => r.centreId) } } });
    for (const c of centres) {
      const availableFrom = c.availableFrom ?? examDate;
      await tx.paperCentre.upsert({
        where: { paperId_centreId: { paperId: p.id, centreId: c.centreId } },
        update: { availableFrom },
        create: { paperId: p.id, centreId: c.centreId, availableFrom },
      });
    }
    await writeAudit(tx, { actor, action: "CENTRES_ASSIGNED", entity: "Paper", entityId: p.id, details: { centreIds: ids } });
  });
}

// Centre portal: schedule metadata for the user's own centre.
export async function centreSchedule(centreId: string) {
  const [centre, assignments] = await Promise.all([
    prisma.centre.findUniqueOrThrow({ where: { id: centreId }, select: { code: true, name: true, city: true } }),
    prisma.paperCentre.findMany({ where: centreAssignmentScope(centreId), include: centreAssignmentInclude, orderBy: { availableFrom: "asc" } }),
  ]);
  return { centre, assignments };
}

// FR-18 time-gated access + FR-19 usage logging + FR-20 auto-USED, in one transaction.
// The server clock is authoritative — the browser countdown is only a display.
// Centres always receive the version frozen when the paper was sent, and each access log
// row records which version that was.
export async function openForCentre(
  actor: Actor & { centreId: string },
  paperId: string,
  mode: "ACCESS" | "DOWNLOAD",
  meta: { ip: string | null; userAgent: string | null },
) {
  return withTx(async (tx) => {
    await lockPaper(tx, paperId);
    const assignment = await tx.paperCentre.findFirst({
      where: { AND: [{ paperId, centreId: actor.centreId }, centreAssignmentScope(actor.centreId)] },
      include: { centre: true },
    });
    if (!assignment) throw new HttpError(404, "Paper not found");
    const now = new Date();
    if (now < assignment.availableFrom) {
      throw new HttpError(423, `Paper is time-locked until ${assignment.availableFrom.toISOString()}`);
    }
    const p = await tx.paper.findUniqueOrThrow({ where: { id: paperId }, include: paperInclude });
    const versionId = p.sentVersionId ?? p.currentVersionId;
    if (!versionId) throw new HttpError(404, "Paper not found");
    const becameUsed = p.status === "SENT_TO_CENTRE"; // exact: the row is locked

    await tx.accessLog.create({
      data: { paperId, versionId, centreId: actor.centreId, userId: actor.id, kind: mode, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) },
    });
    await tx.paperCentre.update({
      where: { id: assignment.id },
      data: {
        firstAccessAt: assignment.firstAccessAt ?? now,
        ...(mode === "DOWNLOAD" && { downloadCount: { increment: 1 }, firstDownloadAt: assignment.firstDownloadAt ?? now }),
      },
    });
    if (becameUsed) await tx.paper.update({ where: { id: paperId }, data: { status: "USED", usedAt: now } });

    const details = { centre: assignment.centre.code, subject: p.exam.course.code };
    await writeAudit(tx, { actor, action: mode === "DOWNLOAD" ? "PAPER_DOWNLOADED" : "PAPER_ACCESSED", entity: "Paper", entityId: paperId, details, ip: meta.ip });
    if (becameUsed) {
      await writeAudit(tx, { actor, action: "PAPER_MARKED_USED", entity: "Paper", entityId: paperId, details: { centre: assignment.centre.code }, ip: meta.ip });
    }
    return { paper: sentState(p), centre: assignment.centre, now };
  });
}
