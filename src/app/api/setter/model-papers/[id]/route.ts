import { route } from "@/server/core/http";
import { requireSetterWithProfile } from "@/server/auth/guard";
import { auditStandalone } from "@/server/modules/audit/service";
import { getModelPaper } from "@/server/modules/papers/service";
import { sentState } from "@/server/modules/papers/serializers";
import { paperFileResponse } from "@/server/modules/papers/files";
import { htmlResponse, renderPaperDocument } from "@/lib/render-paper";
import { getInstitutionName } from "@/server/modules/settings/service";

type Ctx = { params: { id: string } };

// FR-22: view a released model paper — the version that was actually used in the exam.
// No centre, typist or setter details are included.
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireSetterWithProfile();
  const p = await getModelPaper(params.id);
  const s = sentState(p);
  await auditStandalone({ actor: u, action: "RESOURCE_DOWNLOADED", entity: "ModelPaper", entityId: p.id });
  if (s.format === "FILE" && s.fileId) {
    return paperFileResponse(s.fileId, (ext) => `${s.subject.code}-${s.subject.semester}-model.${ext}`, () => false);
  }
  const html = renderPaperDocument(s, { institution: await getInstitutionName(), banner: "MODEL PAPER — for reference only" });
  return htmlResponse(html, `${s.subject.code}-model.html`, false);
});

export const dynamic = "force-dynamic";
