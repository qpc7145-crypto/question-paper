import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, fail, ok, route } from "@/lib/http";
import { hashPassword, PASSWORD_RULE, requireUser } from "@/lib/auth/server";

export const GET = route(async (req: Request) => {
  await requireUser("CONTROLLER");
  const role = new URL(req.url).searchParams.get("role") || undefined;
  const users = await prisma.user.findMany({
    where: { role: role ? role : { not: "CONTROLLER" } },
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
    include: {
      setterProfile: { select: { fullName: true, specialization: true, subjectsEligible: true } },
      superintendent: { select: { fullName: true } },
      centre: { select: { code: true, name: true } },
    },
  });
  return ok({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      displayName: u.displayName,
      isActive: u.isActive,
      locked: !!u.lockedUntil && u.lockedUntil > new Date(),
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      bioDataComplete: u.role === "SETTER" ? !!u.setterProfile : u.role === "SUPERINTENDENT" ? !!u.superintendent : null,
      setterProfile: u.setterProfile,
      centre: u.centre,
    })),
  });
});

const createSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(120),
  role: z.enum(["SETTER", "TYPIST", "SUPERINTENDENT"]), // FR-1
  password: z.string().max(200).optional(),
  centreId: z.string().nullable().optional(), // FR-5: link a Superintendent to their centre at creation
});

function tempPassword() {
  // Guaranteed to satisfy PASSWORD_RULE.
  return `Qp-${crypto.randomBytes(6).toString("base64url")}${crypto.randomInt(10, 99)}aZ`;
}

export const POST = route(async (req: Request) => {
  const actor = await requireUser("CONTROLLER");
  const input = await body(req, createSchema);
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return fail(409, "An account with this email already exists");
  const centre = input.role === "SUPERINTENDENT" && input.centreId ? await prisma.centre.findUnique({ where: { id: input.centreId } }) : null;
  if (input.role === "SUPERINTENDENT" && input.centreId && !centre) return fail(400, "Centre not found");
  if (centre?.superintendentId) return fail(409, `${centre.code} already has a Superintendent. Unlink them on the Centres page first.`);
  const password = input.password || tempPassword();
  if (!PASSWORD_RULE.test(password)) return fail(400, PASSWORD_RULE.message);
  const user = await prisma.user.create({
    data: { email, displayName: input.displayName, role: input.role, passwordHash: await hashPassword(password), createdById: actor.id },
  });
  if (centre) {
    await prisma.centre.update({ where: { id: centre.id }, data: { superintendentId: user.id } });
    await audit({ actor, action: "CENTRE_UPDATED", entity: "Centre", entityId: centre.id, details: { superintendentId: user.id } });
  }
  await audit({ actor, action: "ACCOUNT_CREATED", entity: "User", entityId: user.id, details: { email, role: input.role, centre: centre?.code } });
  // The temporary password is shown once to the Controller and never stored in plain text.
  return ok({ user: { id: user.id, email, role: user.role }, temporaryPassword: input.password ? null : password }, 201);
});

export const dynamic = "force-dynamic";
