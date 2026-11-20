import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { superintendentSchema as schema } from "@/lib/superintendent";

// FR-5: Centre Superintendent bio-data maintained via system entry form.

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
