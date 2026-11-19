import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, route } from "@/lib/http";
import { requireSetterWithProfile } from "@/lib/auth/server";
import { loadPaper } from "@/lib/papers";
import { htmlResponse, renderPaperDocument } from "@/lib/render-paper";
import { getCurrentSemester, getInstitutionName } from "@/lib/settings";
import { fileResponse } from "@/lib/storage";

type Ctx = { params: { id: string } };

// FR-22: view a released model paper. No centre, typist or setter details are included.
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireSetterWithProfile();
  const p = await loadPaper(params.id);
  const current = await getCurrentSemester();
  if (p.status !== "USED" || !p.releasedAsModel || p.subject.semester === current) return fail(404, "Model paper not found");
  await audit({ actor: u, action: "RESOURCE_DOWNLOADED", entity: "ModelPaper", entityId: p.id });
  if (p.format === "FILE" && p.fileId) {
    const f = await prisma.storedFile.findUniqueOrThrow({ where: { id: p.fileId } });
    return fileResponse(f, `${p.subject.code}-${p.subject.semester}-model.${f.originalName.split(".").pop()}`);
  }
  const html = renderPaperDocument(p, { institution: await getInstitutionName(), banner: "MODEL PAPER — for reference only" });
  return htmlResponse(html, `${p.subject.code}-model.html`, false);
});

export const dynamic = "force-dynamic";
