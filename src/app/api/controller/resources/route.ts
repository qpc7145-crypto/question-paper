import { fail, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { listAllResources, uploadResource } from "@/server/modules/resources/service";

export const GET = route(async () => {
  await requireUser("CONTROLLER");
  return ok(await listAllResources());
});

// FR-15: Controller uploads syllabus / model paper.
export const POST = route(async (req: Request) => {
  const actor = await requireUser("CONTROLLER");
  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "Expected multipart form data");
  const resource = await uploadResource(actor, {
    kind: String(form.get("kind") || ""),
    title: String(form.get("title") || "").trim(),
    subjectId: String(form.get("subjectId") || "") || null,
    semester: String(form.get("semester") || "").trim() || null,
    file: form.get("file"),
  });
  return ok({ resource }, 201);
});

export const dynamic = "force-dynamic";
