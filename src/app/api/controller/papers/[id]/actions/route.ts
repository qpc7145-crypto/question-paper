import { z } from "zod";
import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { archivePaper, assignTypist, recallPaper, sendToCentres, setModelRelease } from "@/server/modules/papers/service";
import { setCentres } from "@/server/modules/distribution/service";
import { controllerPaperView } from "@/server/modules/papers/serializers";

type Ctx = { params: { id: string } };

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assignTypist"), typistId: z.string().nullable(), canSend: z.boolean() }),
  z.object({
    action: z.literal("setCentres"),
    centres: z.array(z.object({ centreId: z.string(), availableFrom: z.coerce.date().optional() })).max(200),
  }),
  z.object({ action: z.literal("send") }),
  z.object({ action: z.literal("recall") }),
  z.object({ action: z.literal("archive") }),
  z.object({ action: z.literal("releaseModel"), released: z.boolean() }),
]);

export const POST = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  const input = await body(req, actionSchema);
  const id = params.id;
  const paper = await (() => {
    switch (input.action) {
      case "assignTypist": return assignTypist(actor, id, input.typistId, input.canSend); // FR-7 + FR-13
      case "setCentres": return setCentres(actor, id, input.centres); // FR-17, FR-18
      case "send": return sendToCentres(actor, id);
      case "recall": return recallPaper(actor, id);
      case "archive": return archivePaper(actor, id); // FR-21
      case "releaseModel": return setModelRelease(actor, id, input.released); // FR-22
    }
  })();
  return ok({ paper: controllerPaperView(paper) });
});

export const dynamic = "force-dynamic";
