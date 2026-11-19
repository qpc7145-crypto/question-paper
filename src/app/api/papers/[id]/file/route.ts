import { fail, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { attachFile, loadPaper } from "@/lib/papers";
import { controllerPaperView, setterPaperView, typistPaperView } from "@/lib/serializers";

type Ctx = { params: { id: string } };

// FR-8 / FR-13: upload PDF/Word for a paper (Setter: own draft; Typist: assigned; Controller: any).
export const POST = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("SETTER", "TYPIST", "CONTROLLER");
  if (actor.role === "SETTER" && !actor.profileComplete) return fail(403, "Complete your bio-data first");
  const p = await loadPaper(params.id);
  if (actor.role === "SETTER" && p.setterId !== actor.id) return fail(404, "Paper not found");
  if (actor.role === "TYPIST" && p.typistId !== actor.id) return fail(404, "Paper not found");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "No file uploaded");

  const updated = await attachFile(p.id, actor, file);
  const view =
    actor.role === "CONTROLLER" ? controllerPaperView(updated) : actor.role === "TYPIST" ? typistPaperView(updated) : setterPaperView(updated);
  return ok({ paper: view });
});

export const dynamic = "force-dynamic";
