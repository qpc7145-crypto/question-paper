// Edge-safe session token helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";
import { SESSION_TTL_SECONDS, type Role } from "@/lib/constants";

export type SessionClaims = {
  sub: string;
  role: Role;
  name: string;
  sv: number; // session version — must match User.sessionVersion
  pc: boolean; // profile complete (setter bio-data gate, FR-4)
};

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(claims: SessionClaims) {
  return new SignJWT({ role: claims.role, name: claims.name, sv: claims.sv, pc: claims.pc })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      role: payload.role as Role,
      name: String(payload.name ?? ""),
      sv: Number(payload.sv ?? 0),
      pc: Boolean(payload.pc),
    };
  } catch {
    return null;
  }
}
