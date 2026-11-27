import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma, withTx } from "@/server/core/db";
import { HttpError } from "@/server/core/http";
import { auditStandalone, writeAudit } from "@/server/modules/audit/service";
import { checkPassword, hashPassword, isProfileComplete, PASSWORD_RULE, type SessionUser } from "@/server/auth/guard";
import { sendMail } from "@/server/infra/mailer";

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const GENERIC_LOGIN_ERROR = "Invalid email or password";

// Returns the user to issue a session for, or throws. Every outcome is audited.
export async function login(emailInput: string, password: string) {
  const email = emailInput.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    include: { setterProfile: { select: { userId: true } }, superintendent: { select: { userId: true } } },
  });
  if (!user) {
    await auditStandalone({ actor: null, action: "LOGIN_FAILED", details: { email: emailInput, reason: "unknown_account" } });
    throw new HttpError(401, GENERIC_LOGIN_ERROR);
  }
  const actor = { id: user.id, email: user.email, role: user.role };
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await auditStandalone({ actor, action: "LOGIN_FAILED", details: { reason: "locked" } });
    throw new HttpError(423, `Account temporarily locked after repeated failures. Try again after ${user.lockedUntil.toLocaleTimeString()}.`);
  }
  if (!user.isActive) {
    await auditStandalone({ actor, action: "LOGIN_FAILED", details: { reason: "inactive" } });
    throw new HttpError(401, GENERIC_LOGIN_ERROR);
  }
  if (!(await checkPassword(password, user.passwordHash))) {
    const fails = user.failedLoginCount + 1;
    await withTx(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: fails >= MAX_FAILS ? 0 : fails,
          lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      await writeAudit(tx, { actor, action: "LOGIN_FAILED", details: { reason: "bad_password", attempt: fails } });
    });
    throw new HttpError(401, GENERIC_LOGIN_ERROR);
  }
  await withTx(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await writeAudit(tx, { actor, action: "LOGIN_SUCCESS" });
  });
  return { user, profileComplete: isProfileComplete(user.role, !!user.setterProfile, !!user.superintendent) };
}

export const auditLogout = (u: SessionUser) => auditStandalone({ actor: u, action: "LOGOUT" });

// FR-3 step 1: email a 6-digit OTP. The caller answers identically whether or not the
// account exists (no user enumeration).
export async function requestPasswordReset(emailInput: string) {
  const user = await prisma.user.findUnique({ where: { email: emailInput.toLowerCase() } });
  if (!user || !user.isActive) {
    await auditStandalone({ actor: null, action: "PASSWORD_RESET_REQUESTED", details: { email: emailInput, reason: "unknown_or_inactive" } });
    return;
  }
  const actor = { id: user.id, email: user.email, role: user.role };
  const recent = await prisma.passwordReset.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 15 * 60_000) } } });
  if (recent >= 3) {
    await auditStandalone({ actor, action: "PASSWORD_RESET_FAILED", details: { reason: "rate_limited" } });
    return;
  }
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const otpHash = await bcrypt.hash(otp, 10);
  await withTx(async (tx) => {
    await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    await tx.passwordReset.create({ data: { userId: user.id, otpHash, expiresAt: new Date(Date.now() + 10 * 60_000) } });
    await writeAudit(tx, { actor, action: "PASSWORD_RESET_REQUESTED" });
  });
  await sendMail(
    user.email,
    "Password reset code",
    `Your one-time password reset code is ${otp}. It expires in 10 minutes. If you did not request this, contact the Examinations Office.`,
  );
}

// FR-3 step 2: verify the OTP and set a new password. Every outcome is logged.
export async function resetPassword(emailInput: string, otp: string, password: string) {
  if (!PASSWORD_RULE.test(password)) throw new HttpError(400, PASSWORD_RULE.message);
  const invalid = new HttpError(400, "Invalid or expired code");
  const user = await prisma.user.findUnique({ where: { email: emailInput.toLowerCase() } });
  const reset = user
    ? await prisma.passwordReset.findFirst({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: "desc" } })
    : null;
  if (!user || !reset || reset.expiresAt < new Date() || reset.attempts >= 5) {
    await auditStandalone({ actor: user ? { id: user.id, email: user.email, role: user.role } : null, action: "PASSWORD_RESET_FAILED", details: { reason: "no_valid_code" } });
    throw invalid;
  }
  const actor = { id: user.id, email: user.email, role: user.role };
  if (!(await bcrypt.compare(otp, reset.otpHash))) {
    await withTx(async (tx) => {
      await tx.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
      await writeAudit(tx, { actor, action: "PASSWORD_RESET_FAILED", details: { reason: "wrong_code", attempt: reset.attempts + 1 } });
    });
    throw invalid;
  }
  const passwordHash = await hashPassword(password);
  await withTx(async (tx) => {
    // Single use, even under concurrent submissions of the same code.
    const claimed = await tx.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count === 0) throw invalid;
    await tx.user.update({
      where: { id: user.id },
      // sessionVersion bump signs out every existing session.
      data: { passwordHash, sessionVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null },
    });
    await writeAudit(tx, { actor, action: "PASSWORD_RESET_COMPLETED" });
  });
}

// Returns the updated user so the caller can re-issue this session (others are revoked).
export async function changePassword(u: SessionUser, current: string, password: string) {
  if (!PASSWORD_RULE.test(password)) throw new HttpError(400, PASSWORD_RULE.message);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!(await checkPassword(current, user.passwordHash))) throw new HttpError(400, "Current password is incorrect");
  const passwordHash = await hashPassword(password);
  return withTx(async (tx) => {
    const updated = await tx.user.update({ where: { id: u.id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    await writeAudit(tx, { actor: u, action: "PASSWORD_CHANGED" });
    return updated;
  });
}

export function updateDisplayName(u: SessionUser, displayName: string) {
  return withTx(async (tx) => {
    const updated = await tx.user.update({ where: { id: u.id }, data: { displayName } });
    if (displayName !== u.displayName) {
      await writeAudit(tx, { actor: u, action: "ACCOUNT_UPDATED", entity: "User", entityId: u.id, details: { displayName: { from: u.displayName, to: displayName } } });
    }
    return updated;
  });
}
