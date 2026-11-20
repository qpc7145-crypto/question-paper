import { NextResponse } from "next/server";
import { signSession } from "@/lib/auth/session";
import { ROLE_HOME, ROLES, SESSION_COOKIE, SESSION_TTL_SECONDS, type Role } from "@/lib/constants";
import { DEMO, DEMO_USERS, USERS } from "@/lib/demo/data";

// Design-preview sign-in: issues a session for a fictional user without touching a database.
// ?user= picks a specific sample account of that role (e.g. the setter whose bio-data is pending).
export async function GET(req: Request) {
  if (!DEMO) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const role = sp.get("role") as Role;
  if (!ROLES.includes(role)) return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  const picked = sp.get("user") ? USERS.find((x) => x.id === sp.get("user") && x.role === role) : null;
  const u = picked ? { id: picked.id, name: picked.displayName } : DEMO_USERS[role];
  // FR-4: a setter without bio-data on file is gated to the bio-data form until it is saved (?pc=1).
  const pc = role !== "SETTER" || !picked || !!picked.setterProfile || sp.get("pc") === "1";
  const token = await signSession({ sub: u.id, role, name: u.name, sv: 0, pc });
  const res = NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS });
  return res;
}

export const dynamic = "force-dynamic";
