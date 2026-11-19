import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { saveUpload } from "@/lib/storage";

export const GET = route(async () => {
  await requireUser("CONTROLLER");
  const [resources, subjects] = await Promise.all([
    prisma.resource.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        subject: { select: { code: true, title: true, semester: true } },
        file: { select: { originalName: true, sizeBytes: true } },
      },
    }),
    prisma.subject.findMany({ orderBy: [{ semester: "desc" }, { code: "asc" }], select: { id: true, code: true, title: true, semester: true } }),
  ]);
  return ok({ resources, subjects });
});

// FR-15: Controller uploads syllabus / model paper.
export const POST = route(async (req: Request) => {
  const actor = await requireUser("CONTROLLER");
  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "Expected multipart form data");
  const kind = String(form.get("kind") || "");
  const title = String(form.get("title") || "").trim();
  const subjectId = String(form.get("subjectId") || "") || null;
  const semester = String(form.get("semester") || "").trim() || null;
  const file = form.get("file");
  if (!["SYLLABUS", "MODEL_PAPER"].includes(kind)) return fail(400, "kind must be SYLLABUS or MODEL_PAPER");
  if (title.length < 2 || title.length > 200) return fail(400, "Title is required");
  if (!(file instanceof File)) return fail(400, "No file uploaded");
  if (subjectId && !(await prisma.subject.findUnique({ where: { id: subjectId } }))) return fail(400, "Unknown subject");

  const stored = await saveUpload(file, actor.id);
  const resource = await prisma.resource.create({ data: { kind, title, subjectId, semester, fileId: stored.id } });
  await audit({ actor, action: "RESOURCE_UPLOADED", entity: "Resource", entityId: resource.id, details: { kind, title, subjectId } });
  return ok({ resource }, 201);
});
