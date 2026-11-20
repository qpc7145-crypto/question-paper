import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, fail, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { listSemesters } from "@/lib/settings";
import { setterAssignError, subjectSchema } from "@/lib/subjects";

export const GET = route(async (req: Request) => {
  await requireUser("CONTROLLER");
  const semester = new URL(req.url).searchParams.get("semester") || undefined;
  const subjects = await prisma.subject.findMany({
    where: { semester },
    orderBy: [{ examDate: "asc" }],
    include: {
      setter: { select: { id: true, displayName: true, email: true } },
      paper: { select: { id: true, status: true } },
    },
  });
  return ok({ subjects, semesters: await listSemesters() });
});

// FR-6: create subject; optional FR-7 setter assignment creates the paper draft.
export const POST = route(async (req: Request) => {
  const actor = await requireUser("CONTROLLER");
  const input = await body(req, subjectSchema);
  const setterErr = input.setterId ? await setterAssignError(input.setterId) : null;
  if (setterErr) return fail(409, setterErr);
  const dup = await prisma.subject.findUnique({
    where: { code_semester_examType: { code: input.code, semester: input.semester, examType: input.examType } },
  });
  if (dup) return fail(409, "This subject already exists for that semester and exam type");

  const subject = await prisma.subject.create({ data: { ...input, setterId: input.setterId ?? null } });
  if (subject.setterId) {
    await prisma.paper.create({ data: { subjectId: subject.id, setterId: subject.setterId } });
  }
  await audit({ actor, action: "SUBJECT_CREATED", entity: "Subject", entityId: subject.id, details: { code: subject.code, semester: subject.semester } });
  if (subject.setterId) {
    await audit({ actor, action: "SETTER_ASSIGNED", entity: "Subject", entityId: subject.id, details: { setterId: subject.setterId } });
  }
  return ok({ subject }, 201);
});

export const dynamic = "force-dynamic";
