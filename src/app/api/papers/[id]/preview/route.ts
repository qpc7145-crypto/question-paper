import { prisma } from "@/lib/db";
import { fail, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { loadPaper } from "@/lib/papers";
import { htmlResponse, renderPaperDocument } from "@/lib/render-paper";
import { fileResponse } from "@/lib/storage";
import { getInstitutionName } from "@/lib/settings";

type Ctx = { params: { id: string } };

// Preview of a paper for the people working on it. Centres never use this route —
// they only get the time-gated download (FR-18).
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER", "SETTER", "TYPIST");
  const p = await loadPaper(params.id);
  if (actor.role === "SETTER" && (p.setterId !== actor.id || p.status === "ARCHIVED")) return fail(404, "Paper not found");
  if (actor.role === "TYPIST" && (p.typistId !== actor.id || p.status === "ARCHIVED" || p.status === "DRAFT")) return fail(404, "Paper not found");

  if (p.format === "FILE") {
    if (!p.fileId) return fail(404, "No file uploaded");
    const f = await prisma.storedFile.findUniqueOrThrow({ where: { id: p.fileId } });
    const ext = f.originalName.split(".").pop();
    // Only the Controller sees the original file name (it may reveal the uploader).
    return fileResponse(f, actor.role === "CONTROLLER" ? f.originalName : `${p.subject.code}-paper.${ext}`, f.mimeType === "application/pdf");
  }
  const html = renderPaperDocument(p, {
    institution: await getInstitutionName(),
    banner: `CONFIDENTIAL PREVIEW — status: ${p.status}`,
  });
  return htmlResponse(html, `${p.subject.code}-preview.html`, false);
});
