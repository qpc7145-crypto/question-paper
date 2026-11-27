import type { ResourceKind } from "@prisma/client";
import { prisma, withTx } from "@/server/core/db";
import { HttpError } from "@/server/core/http";
import { auditStandalone, writeAudit } from "@/server/modules/audit/service";
import { MODEL_PAPER_SCOPE, resourceScope, type Actor } from "@/server/policy";
import { examInclude, subjectView, type ExamFull } from "@/server/modules/papers/serializers";
import { saveUpload } from "@/server/infra/storage";
import { isValidSemester, SEMESTER_HINT } from "@/lib/semesters";

// ---------- Controller (FR-15) ----------

const subjectBrief = (e: ExamFull | null) => {
  if (!e) return null;
  const s = subjectView(e);
  return { code: s.code, title: s.title, semester: s.semester };
};

export async function listAllResources() {
  const [resources, exams] = await Promise.all([
    prisma.resource.findMany({
      orderBy: { createdAt: "desc" },
      include: { exam: { include: examInclude }, file: { select: { originalName: true, sizeBytes: true } } },
    }),
    prisma.exam.findMany({ include: examInclude, orderBy: [{ term: { year: "desc" } }, { term: { season: "desc" } }, { course: { code: "asc" } }] }),
  ]);
  return {
    resources: resources.map(({ exam, examId, ...r }) => ({ ...r, subjectId: examId, subject: subjectBrief(exam) })),
    subjects: exams.map((e) => ({ id: e.id, ...subjectBrief(e)! })),
  };
}

export async function uploadResource(
  actor: Actor,
  input: { kind: string; title: string; subjectId: string | null; semester: string | null; file: unknown },
) {
  if (input.kind !== "SYLLABUS" && input.kind !== "MODEL_PAPER") throw new HttpError(400, "kind must be SYLLABUS or MODEL_PAPER");
  const kind: ResourceKind = input.kind;
  if (input.title.length < 2 || input.title.length > 200) throw new HttpError(400, "Title is required");
  if (input.semester && !isValidSemester(input.semester.replace(/s+/g, " "))) throw new HttpError(400, `Semester must be ${SEMESTER_HINT.toLowerCase()}, with a year from 2000 to five years ahead`);
  if (!(input.file instanceof File)) throw new HttpError(400, "No file uploaded");
  if (input.subjectId && !(await prisma.exam.findUnique({ where: { id: input.subjectId } }))) throw new HttpError(400, "Unknown subject");
  const stored = await saveUpload(input.file, actor.id);
  return withTx(async (tx) => {
    const resource = await tx.resource.create({
      data: { kind, title: input.title, examId: input.subjectId, semester: input.semester, fileId: stored.id },
    });
    await writeAudit(tx, { actor, action: "RESOURCE_UPLOADED", entity: "Resource", entityId: resource.id, details: { kind, title: input.title, subjectId: input.subjectId } });
    return resource;
  });
}

// The stored file is retained in the repository for audit purposes; only the listing is removed.
export function deleteResource(actor: Actor, id: string) {
  return withTx(async (tx) => {
    const r = await tx.resource.findUnique({ where: { id } });
    if (!r) throw new HttpError(404, "Resource not found");
    await tx.resource.delete({ where: { id } });
    await writeAudit(tx, { actor, action: "RESOURCE_DELETED", entity: "Resource", entityId: id, details: { kind: r.kind, title: r.title } });
  });
}

// ---------- Setter (FR-16, FR-22) ----------

export async function setterResources(actor: Actor) {
  const scope = resourceScope(actor);
  const include = { exam: { include: examInclude }, file: { select: { sizeBytes: true } } } as const;
  const [syllabi, uploadedModels, releasedPapers] = await Promise.all([
    prisma.resource.findMany({ where: { AND: [scope, { kind: "SYLLABUS" }] }, orderBy: { createdAt: "desc" }, include }),
    prisma.resource.findMany({ where: { AND: [scope, { kind: "MODEL_PAPER" }] }, orderBy: { createdAt: "desc" }, include }),
    prisma.paper.findMany({
      where: MODEL_PAPER_SCOPE,
      orderBy: { exam: { examDate: "desc" } },
      select: { id: true, exam: { include: examInclude } },
    }),
  ]);
  const view = (r: (typeof syllabi)[number]) => {
    const subject = subjectBrief(r.exam);
    return {
      id: r.id, title: r.title, semester: r.semester ?? subject?.semester ?? null,
      subject: subject ? { code: subject.code, title: subject.title } : null,
      sizeBytes: r.file.sizeBytes, createdAt: r.createdAt,
    };
  };
  return {
    syllabi: syllabi.map(view),
    modelPapers: uploadedModels.map(view),
    releasedPapers: releasedPapers.map((p) => {
      const { code, title, semester, examType } = subjectView(p.exam);
      return { paperId: p.id, code, title, semester, examType };
    }),
  };
}

export async function getResourceForDownload(actor: Actor, id: string) {
  const r = await prisma.resource.findFirst({ where: { AND: [{ id }, resourceScope(actor)] }, include: { file: true } });
  if (!r) throw new HttpError(404, "Resource not found");
  await auditStandalone({ actor, action: "RESOURCE_DOWNLOADED", entity: "Resource", entityId: r.id, details: { kind: r.kind } });
  return r;
}
