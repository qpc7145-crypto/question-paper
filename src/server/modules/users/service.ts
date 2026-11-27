import crypto from "node:crypto";
import type { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma, withTx } from "@/server/core/db";
import { HttpError } from "@/server/core/http";
import { writeAudit } from "@/server/modules/audit/service";
import { hashPassword, PASSWORD_RULE } from "@/server/auth/guard";
import type { Actor } from "@/server/policy";
import { ROLES } from "@/lib/constants";
import { decryptField, sealCnic } from "@/server/infra/crypto";
import type { createUserSchema, setterBiodataSchema, superintendentSchema, updateUserSchema } from "./schema";

// Profiles leave the service with the CNIC decrypted and the stored ciphertext/hash removed.
function openProfile<T extends { cnicEncrypted: string; cnicHash: string }>(p: T | null) {
  if (!p) return null;
  const { cnicEncrypted, cnicHash: _h, ...rest } = p;
  return { ...rest, cnic: decryptField(cnicEncrypted) };
}

// ---------- Controller: accounts (FR-1) ----------

export async function listUsers(roleFilter: string | null) {
  const role = roleFilter && (ROLES as readonly string[]).includes(roleFilter) ? (roleFilter as Role) : null;
  if (roleFilter && !role) return [];
  const users = await prisma.user.findMany({
    where: { role: role ?? { not: "CONTROLLER" } },
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
    include: {
      setterProfile: { select: { fullName: true, specialization: true, subjectsEligible: true } },
      superintendent: { select: { fullName: true } },
      centre: { select: { code: true, name: true } },
    },
  });
  return users.map((u) => ({
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
  }));
}

export async function getUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, include: { setterProfile: true, superintendent: true, centre: true } });
  if (!u || u.role === "CONTROLLER") throw new HttpError(404, "User not found");
  const { passwordHash: _ph, sessionVersion: _sv, setterProfile, superintendent, ...safe } = u;
  return { ...safe, setterProfile: openProfile(setterProfile), superintendent: openProfile(superintendent) };
}

function tempPassword() {
  // Guaranteed to satisfy PASSWORD_RULE.
  return `Qp-${crypto.randomBytes(6).toString("base64url")}${crypto.randomInt(10, 99)}aZ`;
}

export async function createUser(actor: Actor, input: z.output<typeof createUserSchema>) {
  const email = input.email.toLowerCase();
  const password = input.password || tempPassword();
  if (!PASSWORD_RULE.test(password)) throw new HttpError(400, PASSWORD_RULE.message);
  const passwordHash = await hashPassword(password); // slow: keep it outside the transaction
  const user = await withTx(async (tx) => {
    if (await tx.user.findUnique({ where: { email } })) throw new HttpError(409, "An account with this email already exists");
    const centre = input.role === "SUPERINTENDENT" && input.centreId ? await tx.centre.findUnique({ where: { id: input.centreId } }) : null;
    if (input.role === "SUPERINTENDENT" && input.centreId && !centre) throw new HttpError(400, "Centre not found");
    if (centre?.superintendentId) throw new HttpError(409, `${centre.code} already has a Superintendent. Unlink them on the Centres page first.`);
    const user = await tx.user.create({ data: { email, displayName: input.displayName, role: input.role, passwordHash, createdById: actor.id } });
    if (centre) {
      await tx.centre.update({ where: { id: centre.id }, data: { superintendentId: user.id } });
      await writeAudit(tx, { actor, action: "CENTRE_UPDATED", entity: "Centre", entityId: centre.id, details: { superintendentId: user.id } });
    }
    await writeAudit(tx, { actor, action: "ACCOUNT_CREATED", entity: "User", entityId: user.id, details: { email, role: input.role, centre: centre?.code } });
    return user;
  });
  // The temporary password is shown once to the Controller and never stored in plain text.
  return { user: { id: user.id, email, role: user.role }, temporaryPassword: input.password ? null : password };
}

export function updateUser(actor: Actor, id: string, input: z.output<typeof updateUserSchema>) {
  return withTx(async (tx) => {
    const u = await tx.user.findUnique({ where: { id } });
    if (!u || u.role === "CONTROLLER") throw new HttpError(404, "User not found");
    await tx.user.update({
      where: { id },
      data: {
        ...(input.displayName && { displayName: input.displayName }),
        ...(input.isActive !== undefined && { isActive: input.isActive, sessionVersion: { increment: 1 } }),
        ...(input.unlock && { lockedUntil: null, failedLoginCount: 0 }),
      },
    });
    await writeAudit(tx, { actor, action: "ACCOUNT_UPDATED", entity: "User", entityId: id, details: input });
  });
}

// ---------- Bio-data (FR-4, FR-5) ----------

export const getSetterProfile = async (userId: string) => openProfile(await prisma.setterProfile.findUnique({ where: { userId } }));

// Returns true when this is the first completion (the caller re-issues the session to lift the FR-4 gate).
export function saveSetterProfile(actor: Actor, input: z.output<typeof setterBiodataSchema>) {
  return withTx(async (tx) => {
    const existed = await tx.setterProfile.findUnique({ where: { userId: actor.id } });
    const { cnic, ...fields } = input;
    const data = { ...fields, ...sealCnic(cnic) };
    await tx.setterProfile.upsert({ where: { userId: actor.id }, update: data, create: { ...data, userId: actor.id } });
    await writeAudit(tx, { actor, action: "BIODATA_UPDATED", entity: "SetterProfile", entityId: actor.id, details: { firstCompletion: !existed } });
    return !existed;
  });
}

export async function getOwnCentreProfile(actor: Actor) {
  const [profile, centre] = await Promise.all([
    prisma.superintendentProfile.findUnique({ where: { userId: actor.id } }).then(openProfile),
    prisma.centre.findUnique({ where: { superintendentId: actor.id }, select: { code: true, name: true, address: true, city: true, capacity: true } }),
  ]);
  return { profile, centre };
}

// The Superintendent edits their own profile; the Controller may enter or correct anyone's.
export function saveSuperintendentProfile(actor: Actor, userId: string, input: z.output<typeof superintendentSchema>) {
  return withTx(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } });
    if (!u || u.role !== "SUPERINTENDENT") throw new HttpError(404, "Superintendent not found");
    const { cnic, ...fields } = input;
    const data = { ...fields, ...sealCnic(cnic) };
    await tx.superintendentProfile.upsert({ where: { userId }, update: data, create: { ...data, userId } });
    await writeAudit(tx, actor.id === userId
      ? { actor, action: "BIODATA_UPDATED", entity: "SuperintendentProfile", entityId: userId }
      : { actor, action: "BIODATA_UPDATED", entity: "User", entityId: userId, details: { by: "controller" } });
  });
}

// The fields issueSession() needs, fresh from the database.
export const getSessionRecord = (id: string) =>
  prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, role: true, displayName: true, sessionVersion: true } });
