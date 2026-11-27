import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { createSubject, listSubjects } from "@/server/modules/academics/service";
import { subjectSchema } from "@/server/modules/academics/schema";

export const GET = route(async (req: Request) => {
  await requireUser("CONTROLLER");
  return ok(await listSubjects(new URL(req.url).searchParams.get("semester") || undefined));
});

// FR-6: create subject; optional FR-7 setter assignment creates the paper draft.
export const POST = route(async (req: Request) => {
  const actor = await requireUser("CONTROLLER");
  return ok({ subject: await createSubject(actor, await body(req, subjectSchema)) }, 201);
});

export const dynamic = "force-dynamic";
