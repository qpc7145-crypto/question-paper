import { route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { getResourceForDownload } from "@/server/modules/resources/service";
import { fileResponse, safeName } from "@/server/infra/storage";

type Ctx = { params: { id: string } };

// FR-16: Setters download syllabus (general, or for their assigned subjects) and model papers,
// before and after submission. Visibility is decided by policy.resourceScope.
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER", "SETTER");
  const r = await getResourceForDownload(actor, params.id);
  return fileResponse(r.file, safeName(r.title, r.file.originalName));
});

export const dynamic = "force-dynamic";
