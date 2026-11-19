import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";

// FR-5: Centre Superintendent bio-data maintained via system entry form.
const schema = z.object({
  fullName: z.string().min(3).max(120),
  cnic: z.string().regex(/^\d{5}-\d{7}-\d$/, "CNIC must be in the format 12345-1234567-1"),
  designation: z.string().min(2).max(120),
  organization: z.string().min(2).max(200),
  phone: z.string().regex(/^[+\d][\d\s-]{6,19}$/, "Enter a valid phone number"),
  address: z.string().min(5).max(500),
});

export const GET = route(async () => {
  const u = await requireUser("SUPERINTENDENT");
  const [profile, centre] = await Promise.all([
    prisma.superintendentProfile.findUnique({ where: { userId: u.id } }),
    prisma.centre.findUnique({ where: { superintendentId: u.id }, select: { code: true, name: true, address: true, city: true, capacity: true } }),
  ]);
  return ok({ profile, centre, email: u.email });
});

export const PUT = route(async (req: Request) => {
  const u = await requireUser("SUPERINTENDENT");
  const input = await body(req, schema);
  await prisma.superintendentProfile.upsert({ where: { userId: u.id }, update: input, create: { ...input, userId: u.id } });
  await audit({ actor: u, action: "BIODATA_UPDATED", entity: "SuperintendentProfile", entityId: u.id });
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
