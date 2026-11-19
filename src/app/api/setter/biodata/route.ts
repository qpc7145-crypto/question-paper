import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, ok, route } from "@/lib/http";
import { issueSession, requireUser } from "@/lib/auth/server";

// FR-4 mandatory Setter bio-data.
const schema = z.object({
  fullName: z.string().min(3).max(120),
  cnic: z.string().regex(/^\d{5}-\d{7}-\d$/, "CNIC must be in the format 12345-1234567-1"),
  qualification: z.string().min(2).max(200),
  institution: z.string().min(2).max(200),
  experienceYears: z.number().int().min(0).max(60),
  specialization: z.string().min(2).max(200),
  phone: z.string().regex(/^[+\d][\d\s-]{6,19}$/, "Enter a valid phone number"),
  address: z.string().min(5).max(500),
  subjectsEligible: z.string().min(2).max(1000),
});

export const GET = route(async () => {
  const u = await requireUser("SETTER");
  const profile = await prisma.setterProfile.findUnique({ where: { userId: u.id } });
  return ok({ profile, email: u.email });
});

export const PUT = route(async (req: Request) => {
  const u = await requireUser("SETTER");
  const input = await body(req, schema);
  const existed = await prisma.setterProfile.findUnique({ where: { userId: u.id } });
  await prisma.setterProfile.upsert({ where: { userId: u.id }, update: input, create: { ...input, userId: u.id } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!existed) await issueSession(user, true); // lift the FR-4 gate in the session token
  await audit({ actor: u, action: "BIODATA_UPDATED", entity: "SetterProfile", entityId: u.id, details: { firstCompletion: !existed } });
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
