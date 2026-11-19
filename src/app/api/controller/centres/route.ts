import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, fail, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";

const centreSchema = z.object({
  code: z.string().min(2).max(20).transform((s) => s.trim().toUpperCase()),
  name: z.string().min(2).max(200),
  address: z.string().max(500).default(""),
  city: z.string().max(100).default(""),
  capacity: z.number().int().min(0).max(100000).default(0),
  superintendentId: z.string().nullable().optional(),
});

export const GET = route(async () => {
  await requireUser("CONTROLLER");
  const [centres, superintendents] = await Promise.all([
    prisma.centre.findMany({
      orderBy: { code: "asc" },
      include: {
        superintendent: { select: { id: true, displayName: true, email: true, superintendent: true } },
        _count: { select: { assignments: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "SUPERINTENDENT", isActive: true },
      select: { id: true, displayName: true, email: true, centre: { select: { id: true } } },
    }),
  ]);
  return ok({ centres, superintendents });
});

export const POST = route(async (req: Request) => {
  const actor = await requireUser("CONTROLLER");
  const input = await body(req, centreSchema);
  if (await prisma.centre.findUnique({ where: { code: input.code } })) return fail(409, "Centre code already exists");
  if (input.superintendentId) {
    const s = await prisma.user.findUnique({ where: { id: input.superintendentId }, include: { centre: true } });
    if (!s || s.role !== "SUPERINTENDENT") return fail(400, "Selected user is not a Centre Superintendent");
    if (s.centre) return fail(409, "This superintendent already supervises another centre");
  }
  const centre = await prisma.centre.create({ data: { ...input, superintendentId: input.superintendentId ?? null } });
  await audit({ actor, action: "CENTRE_CREATED", entity: "Centre", entityId: centre.id, details: { code: centre.code } });
  return ok({ centre }, 201);
});

export const dynamic = "force-dynamic";
