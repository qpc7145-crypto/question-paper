import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { body, ok, route } from "@/lib/http";
import { sendMail } from "@/lib/mailer";

// FR-3: self-service reset — step 1, email a 6-digit OTP. No Controller approval.
// The response is identical whether or not the account exists (no user enumeration).
export const POST = route(async (req: Request) => {
  const { email } = await body(req, z.object({ email: z.string().email() }));
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (user && user.isActive) {
    const recent = await prisma.passwordReset.count({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 15 * 60_000) } },
    });
    if (recent < 3) {
      const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      await prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      await prisma.passwordReset.create({
        data: { userId: user.id, otpHash: await bcrypt.hash(otp, 10), expiresAt: new Date(Date.now() + 10 * 60_000) },
      });
      await sendMail(
        user.email,
        "Password reset code",
        `Your one-time password reset code is ${otp}. It expires in 10 minutes. If you did not request this, contact the Examinations Office.`,
      );
      await audit({ actor: { id: user.id, email: user.email, role: user.role }, action: "PASSWORD_RESET_REQUESTED" });
    } else {
      await audit({ actor: { id: user.id, email: user.email, role: user.role }, action: "PASSWORD_RESET_FAILED", details: { reason: "rate_limited" } });
    }
  } else {
    await audit({ actor: null, action: "PASSWORD_RESET_REQUESTED", details: { email, reason: "unknown_or_inactive" } });
  }
  return ok({ message: "If an account exists for this email, a 6-digit code has been sent." });
});

export const dynamic = "force-dynamic";
