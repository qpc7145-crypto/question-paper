import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, notFound, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";

type Ctx = { params: { id: string } };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  await requireUser("CONTROLLER");
  const u = await prisma.user.findUnique({
    where: { id: params.id },
    include: { setterProfile: true, superintendent: true, centre: true },
  });
  if (!u || u.role === "CONTROLLER") notFound("User");
  const { passwordHash: _ph, sessionVersion: _sv, ...safe } = u;
  return ok({ user: safe });
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  const input = await body(
    req,
    z.object({ isActive: z.boolean().optional(), displayName: z.string().min(2).max(120).optional(), unlock: z.boolean().optional() }),
  );
  const u = await prisma.user.findUnique({ where: { id: params.id } });
  if (!u || u.role === "CONTROLLER") notFound("User");
  await prisma.user.update({
    where: { id: u.id },
    data: {
      ...(input.displayName && { displayName: input.displayName }),
      ...(input.isActive !== undefined && { isActive: input.isActive, sessionVersion: { increment: 1 } }),
      ...(input.unlock && { lockedUntil: null, failedLoginCount: 0 }),
    },
  });
  await audit({ actor, action: "ACCOUNT_UPDATED", entity: "User", entityId: u.id, details: input });
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
