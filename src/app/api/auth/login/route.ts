import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, fail, ok, route } from "@/lib/http";
import { checkPassword, isProfileComplete, issueSession } from "@/lib/auth/server";
import { ROLE_HOME, type Role } from "@/lib/constants";

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export const POST = route(async (req: Request) => {
  const { email, password } = await body(req, z.object({ email: z.string().email(), password: z.string().min(1).max(200) }));
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { setterProfile: { select: { userId: true } }, superintendent: { select: { userId: true } } },
  });

  const generic = "Invalid email or password";
  if (!user) {
    await audit({ actor: null, action: "LOGIN_FAILED", details: { email, reason: "unknown_account" } });
    return fail(401, generic);
  }
  const actor = { id: user.id, email: user.email, role: user.role };
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({ actor, action: "LOGIN_FAILED", details: { reason: "locked" } });
    return fail(423, `Account temporarily locked after repeated failures. Try again after ${user.lockedUntil.toLocaleTimeString()}.`);
  }
  if (!user.isActive) {
    await audit({ actor, action: "LOGIN_FAILED", details: { reason: "inactive" } });
    return fail(401, generic);
  }
  if (!(await checkPassword(password, user.passwordHash))) {
    const fails = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: fails >= MAX_FAILS ? 0 : fails,
        lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await audit({ actor, action: "LOGIN_FAILED", details: { reason: "bad_password", attempt: fails } });
    return fail(401, generic);
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const pc = isProfileComplete(user.role as Role, !!user.setterProfile, !!user.superintendent);
  await issueSession(user, pc);
  await audit({ actor, action: "LOGIN_SUCCESS" });
  const home = ROLE_HOME[user.role as Role];
  return ok({ redirect: user.role === "SETTER" && !pc ? "/setter/biodata" : home });
});

export const dynamic = "force-dynamic";
