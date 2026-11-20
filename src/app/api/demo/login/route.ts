import { NextResponse } from "next/server";
import { signSession } from "@/lib/auth/session";
import { ROLE_HOME, ROLES, SESSION_COOKIE, SESSION_TTL_SECONDS, type Role } from "@/lib/constants";
import { DEMO, DEMO_USERS } from "@/lib/demo/data";

// Design-preview sign-in: issues a session for a fictional user without touching a database.
export async function GET(req: Request) {
  if (!DEMO) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = new URL(req.url).searchParams.get("role") as Role;
  if (!ROLES.includes(role)) return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  const u = DEMO_USERS[role];
  const token = await signSession({ sub: u.id, role, name: u.name, sv: 0, pc: true });
  const res = NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS });
  return res;
}

export const dynamic = "force-dynamic";
