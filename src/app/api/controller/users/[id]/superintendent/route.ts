import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, notFound, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { superintendentSchema } from "@/lib/superintendent";

type Ctx = { params: { id: string } };

// FR-5: the Controller can enter or correct a Centre Superintendent's bio-data.
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  const input = await body(req, superintendentSchema);
  const u = await prisma.user.findUnique({ where: { id: params.id } });
  if (!u || u.role !== "SUPERINTENDENT") notFound("Superintendent");
  await prisma.superintendentProfile.upsert({ where: { userId: u.id }, update: input, create: { ...input, userId: u.id } });
  await audit({ actor, action: "BIODATA_UPDATED", entity: "User", entityId: u.id, details: { by: "controller" } });
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
