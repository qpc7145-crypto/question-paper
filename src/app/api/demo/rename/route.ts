import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signSession, verifySession } from "@/lib/auth/session";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/constants";
import { DEMO } from "@/lib/demo/flag";

// Design preview: re-issue the session cookie with a new display name so the sidebar shows it.
export async function POST(req: Request) {
  if (!DEMO) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const token = cookies().get(SESSION_COOKIE)?.value;
  const s = token ? await verifySession(token) : null;
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { displayName } = (await req.json().catch(() => ({}))) as { displayName?: unknown };
  const name = typeof displayName === "string" ? displayName.trim() : "";
  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: "Display name must be 2–120 characters" }, { status: 400 });
  const res = NextResponse.json({ displayName: name });
  res.cookies.set(SESSION_COOKIE, await signSession({ ...s, name }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}

export const dynamic = "force-dynamic";
