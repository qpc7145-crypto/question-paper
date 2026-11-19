import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notFound, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";

type Ctx = { params: { id: string } };

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  const r = await prisma.resource.findUnique({ where: { id: params.id } });
  if (!r) notFound("Resource");
  // The stored file is retained in the repository for audit purposes; only the listing is removed.
  await prisma.resource.delete({ where: { id: r.id } });
  await audit({ actor, action: "RESOURCE_DELETED", entity: "Resource", entityId: r.id, details: { kind: r.kind, title: r.title } });
  return ok({ ok: true });
});
