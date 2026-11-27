import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, ok, route } from "@/lib/http";
import { issueSession, requireUser } from "@/lib/auth/server";

// Any signed-in user can change their own display name (shown in the sidebar and on records they create).
export const PATCH = route(async (req: Request) => {
  const u = await requireUser();
  const input = await body(req, z.object({ displayName: z.string().trim().min(2, "Display name must be at least 2 characters").max(120) }));
  const updated = await prisma.user.update({ where: { id: u.id }, data: { displayName: input.displayName } });
  await issueSession(updated, u.profileComplete); // the sidebar reads the name from the session
  if (input.displayName !== u.displayName) {
    await audit({ actor: u, action: "ACCOUNT_UPDATED", entity: "User", entityId: u.id, details: { displayName: { from: u.displayName, to: input.displayName } } });
  }
  return ok({ displayName: updated.displayName });
});

export const dynamic = "force-dynamic";
