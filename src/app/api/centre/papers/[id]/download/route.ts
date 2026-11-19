import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { clientIp, fail, route } from "@/lib/http";
import { requireCentreUser } from "@/lib/auth/server";
import { loadPaper } from "@/lib/papers";
import { htmlResponse, renderPaperDocument } from "@/lib/render-paper";
import { getInstitutionName } from "@/lib/settings";
import { fileResponse } from "@/lib/storage";

type Ctx = { params: { id: string } };

// FR-18 time-gated access + FR-19 usage logging + FR-20 auto-USED.
// ?mode=view opens in the browser (ACCESS), default downloads (DOWNLOAD).
export const GET = route(async (req: Request, { params }: Ctx) => {
  const u = await requireCentreUser();
  const mode = new URL(req.url).searchParams.get("mode") === "view" ? "ACCESS" : "DOWNLOAD";
  const assignment = await prisma.paperCentre.findUnique({
    where: { paperId_centreId: { paperId: params.id, centreId: u.centreId } },
    include: { centre: true },
  });
  if (!assignment) return fail(404, "Paper not found");
  const p = await loadPaper(params.id);
  if (p.status !== "SENT_TO_CENTRE" && p.status !== "USED") return fail(404, "Paper not found");

  const now = new Date();
  if (now < assignment.availableFrom) {
    // The server clock is authoritative — the browser countdown is only a display.
    return fail(423, `Paper is time-locked until ${assignment.availableFrom.toISOString()}`);
  }

  const ip = clientIp();
  const becameUsed = p.status === "SENT_TO_CENTRE";
  await prisma.$transaction(async (tx) => {
    await tx.accessLog.create({
      data: { paperId: p.id, centreId: u.centreId, userId: u.id, kind: mode, ip, userAgent: req.headers.get("user-agent")?.slice(0, 300) },
    });
    await tx.paperCentre.update({
      where: { id: assignment.id },
      data: {
        firstAccessAt: assignment.firstAccessAt ?? now,
        ...(mode === "DOWNLOAD" && { downloadCount: { increment: 1 }, firstDownloadAt: assignment.firstDownloadAt ?? now }),
      },
    });
    if (becameUsed) {
      await tx.paper.updateMany({ where: { id: p.id, status: "SENT_TO_CENTRE" }, data: { status: "USED", usedAt: now } });
    }
  });

  await audit({
    actor: u,
    action: mode === "DOWNLOAD" ? "PAPER_DOWNLOADED" : "PAPER_ACCESSED",
    entity: "Paper",
    entityId: p.id,
    details: { centre: assignment.centre.code, subject: p.subject.code },
    ip,
  });
  if (becameUsed) {
    await audit({ actor: u, action: "PAPER_MARKED_USED", entity: "Paper", entityId: p.id, details: { centre: assignment.centre.code }, ip });
  }

  const base = `${p.subject.code}-${p.subject.examType}-${assignment.centre.code}`;
  if (p.format === "FILE" && p.fileId) {
    const f = await prisma.storedFile.findUniqueOrThrow({ where: { id: p.fileId } });
    const ext = f.originalName.split(".").pop();
    return fileResponse(f, `${base}.${ext}`, mode === "ACCESS" && f.mimeType === "application/pdf");
  }
  const html = renderPaperDocument(p, {
    institution: await getInstitutionName(),
    watermark: `${assignment.centre.code} · ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`,
  });
  return htmlResponse(html, `${base}.html`, mode === "DOWNLOAD");
});

export const dynamic = "force-dynamic";
