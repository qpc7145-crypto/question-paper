import { fail, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { getPaper } from "@/server/modules/papers/service";
import { paperState } from "@/server/modules/papers/serializers";
import { paperFileResponse } from "@/server/modules/papers/files";
import { htmlResponse, renderPaperDocument } from "@/lib/render-paper";
import { getInstitutionName } from "@/server/modules/settings/service";

type Ctx = { params: { id: string } };

// Preview of a paper for the people working on it. Centres never use this route —
// they only get the time-gated download (FR-18).
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER", "SETTER", "TYPIST");
  const p = await getPaper(actor, params.id);
  const s = paperState(p);
  if (s.format === "FILE") {
    if (!s.fileId) return fail(404, "No file uploaded");
    // Only the Controller sees the original file name (it may reveal the uploader).
    return paperFileResponse(
      s.fileId,
      (ext, original) => (actor.role === "CONTROLLER" ? original : `${s.subject.code}-paper.${ext}`),
      (mime) => mime === "application/pdf",
    );
  }
  const html = renderPaperDocument(s, {
    institution: await getInstitutionName(),
    banner: `CONFIDENTIAL PREVIEW — status: ${p.status}`,
  });
  return htmlResponse(html, `${s.subject.code}-preview.html`, false);
});

export const dynamic = "force-dynamic";
