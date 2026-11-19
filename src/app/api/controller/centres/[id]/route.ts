import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, fail, notFound, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";

type Ctx = { params: { id: string } };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  const input = await body(
    req,
    z.object({
      name: z.string().min(2).max(200).optional(),
      address: z.string().max(500).optional(),
      city: z.string().max(100).optional(),
      capacity: z.number().int().min(0).max(100000).optional(),
      superintendentId: z.string().nullable().optional(),
    }),
  );
  const centre = await prisma.centre.findUnique({ where: { id: params.id } });
  if (!centre) notFound("Centre");
  if (input.superintendentId && input.superintendentId !== centre.superintendentId) {
    const s = await prisma.user.findUnique({ where: { id: input.superintendentId }, include: { centre: true } });
    if (!s || s.role !== "SUPERINTENDENT") return fail(400, "Selected user is not a Centre Superintendent");
    if (s.centre) return fail(409, "This superintendent already supervises another centre");
  }
  const updated = await prisma.centre.update({ where: { id: centre.id }, data: input });
  await audit({ actor, action: "CENTRE_UPDATED", entity: "Centre", entityId: centre.id, details: input });
  return ok({ centre: updated });
});

export const dynamic = "force-dynamic";
