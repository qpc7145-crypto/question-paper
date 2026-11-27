import { z } from "zod";
import { prisma, withTx, type Tx } from "@/server/core/db";
import { HttpError } from "@/server/core/http";
import { writeAudit } from "@/server/modules/audit/service";
import type { Actor } from "@/server/policy";

export const centreSchema = z.object({
  code: z.string().min(2).max(20).transform((s) => s.trim().toUpperCase()),
  name: z.string().min(2).max(200),
  address: z.string().max(500).default(""),
  city: z.string().max(100).default(""),
  capacity: z.number().int().min(0).max(100000).default(0),
  superintendentId: z.string().nullable().optional(),
});

export const centrePatchSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  capacity: z.number().int().min(0).max(100000).optional(),
  superintendentId: z.string().nullable().optional(),
});

export async function listCentres() {
  const [centres, superintendents] = await Promise.all([
    prisma.centre.findMany({
      orderBy: { code: "asc" },
      include: {
        superintendent: { select: { id: true, displayName: true, email: true, superintendent: { select: { fullName: true, phone: true } } } },
        _count: { select: { assignments: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "SUPERINTENDENT", isActive: true },
      select: { id: true, displayName: true, email: true, centre: { select: { id: true } } },
    }),
  ]);
  return { centres, superintendents };
}

async function assertFreeSuperintendent(tx: Tx, userId: string) {
  const s = await tx.user.findUnique({ where: { id: userId }, include: { centre: true } });
  if (!s || s.role !== "SUPERINTENDENT") throw new HttpError(400, "Selected user is not a Centre Superintendent");
  if (s.centre) throw new HttpError(409, "This superintendent already supervises another centre");
}

export function createCentre(actor: Actor, input: z.output<typeof centreSchema>) {
  return withTx(async (tx) => {
    if (await tx.centre.findUnique({ where: { code: input.code } })) throw new HttpError(409, "Centre code already exists");
    if (input.superintendentId) await assertFreeSuperintendent(tx, input.superintendentId);
    const centre = await tx.centre.create({ data: { ...input, superintendentId: input.superintendentId ?? null } });
    await writeAudit(tx, { actor, action: "CENTRE_CREATED", entity: "Centre", entityId: centre.id, details: { code: centre.code } });
    return centre;
  });
}

export function updateCentre(actor: Actor, id: string, input: z.output<typeof centrePatchSchema>) {
  return withTx(async (tx) => {
    const centre = await tx.centre.findUnique({ where: { id } });
    if (!centre) throw new HttpError(404, "Centre not found");
    if (input.superintendentId && input.superintendentId !== centre.superintendentId) {
      await assertFreeSuperintendent(tx, input.superintendentId);
    }
    const updated = await tx.centre.update({ where: { id }, data: input });
    await writeAudit(tx, { actor, action: "CENTRE_UPDATED", entity: "Centre", entityId: id, details: input });
    return updated;
  });
}
