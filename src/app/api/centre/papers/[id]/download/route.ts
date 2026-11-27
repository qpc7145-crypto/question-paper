import { clientIp, route } from "@/server/core/http";
import { requireCentreUser } from "@/server/auth/guard";
import { openForCentre } from "@/server/modules/distribution/service";
import { paperFileResponse } from "@/server/modules/papers/files";
import { htmlResponse, renderPaperDocument } from "@/lib/render-paper";
import { getInstitutionName } from "@/server/modules/settings/service";

type Ctx = { params: { id: string } };

// FR-18 time-gated access + FR-19 usage logging + FR-20 auto-USED.
// ?mode=view opens in the browser (ACCESS), default downloads (DOWNLOAD).
export const GET = route(async (req: Request, { params }: Ctx) => {
  const u = await requireCentreUser();
  const mode = new URL(req.url).searchParams.get("mode") === "view" ? "ACCESS" : "DOWNLOAD";
  const { paper: p, centre, now } = await openForCentre(u, params.id, mode, {
    ip: clientIp(),
    userAgent: req.headers.get("user-agent"),
  });
  const base = `${p.subject.code}-${p.subject.examType}-${centre.code}`;
  if (p.format === "FILE" && p.fileId) {
    return paperFileResponse(p.fileId, (ext) => `${base}.${ext}`, (mime) => mode === "ACCESS" && mime === "application/pdf");
  }
  const html = renderPaperDocument(p, {
    institution: await getInstitutionName(),
    watermark: `${centre.code} · ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`,
  });
  return htmlResponse(html, `${base}.html`, mode === "DOWNLOAD");
});

export const dynamic = "force-dynamic";
