import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { fileResponse, safeName } from "@/lib/storage";

type Ctx = { params: { id: string } };

// FR-16: Setters download syllabus (general, or for their assigned subjects) and model papers,
// before and after submission.
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER", "SETTER");
  const r = await prisma.resource.findUnique({ where: { id: params.id }, include: { file: true, subject: true } });
  if (!r) return fail(404, "Resource not found");
  if (actor.role === "SETTER") {
    if (!actor.profileComplete) return fail(403, "Complete your bio-data first");
    if (r.kind === "SYLLABUS" && r.subject && r.subject.setterId !== actor.id) return fail(404, "Resource not found");
  }
  await audit({ actor, action: "RESOURCE_DOWNLOADED", entity: "Resource", entityId: r.id, details: { kind: r.kind } });
  return fileResponse(r.file, safeName(r.title, r.file.originalName));
});

export const dynamic = "force-dynamic";
