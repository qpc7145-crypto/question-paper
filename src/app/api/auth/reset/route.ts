import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, fail, ok, route } from "@/lib/http";
import { hashPassword, PASSWORD_RULE } from "@/lib/auth/server";

// FR-3 step 2: verify OTP and set a new password. Every outcome is logged.
export const POST = route(async (req: Request) => {
  const input = await body(
    req,
    z.object({ email: z.string().email(), otp: z.string().regex(/^\d{6}$/), password: z.string().max(200) }),
  );
  if (!PASSWORD_RULE.test(input.password)) return fail(400, PASSWORD_RULE.message);

  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  const reset = user
    ? await prisma.passwordReset.findFirst({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: "desc" } })
    : null;
  const invalid = "Invalid or expired code";
  if (!user || !reset || reset.expiresAt < new Date() || reset.attempts >= 5) {
    await audit({ actor: user ? { id: user.id, email: user.email, role: user.role } : null, action: "PASSWORD_RESET_FAILED", details: { reason: "no_valid_code" } });
    return fail(400, invalid);
  }
  const actor = { id: user.id, email: user.email, role: user.role };
  if (!(await bcrypt.compare(input.otp, reset.otpHash))) {
    await prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
    await audit({ actor, action: "PASSWORD_RESET_FAILED", details: { reason: "wrong_code", attempt: reset.attempts + 1 } });
    return fail(400, invalid);
  }

  await prisma.$transaction([
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: user.id },
      // sessionVersion bump signs out every existing session.
      data: { passwordHash: await hashPassword(input.password), sessionVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null },
    }),
  ]);
  await audit({ actor, action: "PASSWORD_RESET_COMPLETED" });
  return ok({ message: "Password updated. You can now sign in." });
});
