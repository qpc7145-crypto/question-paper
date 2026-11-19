import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, fail, ok, route } from "@/lib/http";
import { checkPassword, hashPassword, issueSession, PASSWORD_RULE, requireUser } from "@/lib/auth/server";

export const POST = route(async (req: Request) => {
  const u = await requireUser();
  const input = await body(req, z.object({ current: z.string().max(200), password: z.string().max(200) }));
  if (!PASSWORD_RULE.test(input.password)) return fail(400, PASSWORD_RULE.message);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!(await checkPassword(input.current, user.passwordHash))) return fail(400, "Current password is incorrect");
  const updated = await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(input.password), sessionVersion: { increment: 1 } },
  });
  await issueSession(updated, u.profileComplete); // keep this session, revoke others
  await audit({ actor: u, action: "PASSWORD_CHANGED" });
  return ok({ message: "Password changed" });
});
