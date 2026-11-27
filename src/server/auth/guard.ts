import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/core/db";
import { HttpError } from "@/server/core/http";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, type Role } from "@/lib/constants";
import { signSession, verifySession } from "@/server/auth/session";

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  profileComplete: boolean;
  centreId: string | null;
};

// Every API call re-validates against the database: deactivated users and
// revoked sessions (sessionVersion bump) are rejected immediately.
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token);
  if (!claims) return null;
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    include: {
      setterProfile: { select: { userId: true } },
      superintendent: { select: { userId: true } },
      centre: { select: { id: true } },
    },
  });
  if (!user || !user.isActive || user.sessionVersion !== claims.sv) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role as Role,
    displayName: user.displayName,
    profileComplete: isProfileComplete(user.role as Role, !!user.setterProfile, !!user.superintendent),
    centreId: user.centre?.id ?? null,
  };
}

export function isProfileComplete(role: Role, hasSetterProfile: boolean, _hasSupProfile: boolean) {
  // FR-4: only the Setter is hard-gated on bio-data.
  return role === "SETTER" ? hasSetterProfile : true;
}

export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new HttpError(401, "Not authenticated");
  if (roles.length && !roles.includes(u.role)) throw new HttpError(403, "You do not have access to this resource");
  return u;
}

// Setter endpoints (other than bio-data) are blocked until bio-data is complete (FR-4).
export async function requireSetterWithProfile() {
  const u = await requireUser("SETTER");
  if (!u.profileComplete) throw new HttpError(403, "Complete your bio-data before accessing paper assignments");
  return u;
}

export async function requireCentreUser() {
  const u = await requireUser("SUPERINTENDENT");
  if (!u.centreId) throw new HttpError(403, "No examination centre is linked to your account");
  return u as SessionUser & { centreId: string };
}

export async function issueSession(user: { id: string; role: string; displayName: string; sessionVersion: number }, profileComplete: boolean) {
  const token = await signSession({
    sub: user.id,
    role: user.role as Role,
    name: user.displayName,
    sv: user.sessionVersion,
    pc: profileComplete,
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSession() {
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export const PASSWORD_RULE = {
  min: 10,
  message: "Password must be at least 10 characters and include upper-case, lower-case and a number",
  test: (pw: string) => pw.length >= 10 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw),
};
