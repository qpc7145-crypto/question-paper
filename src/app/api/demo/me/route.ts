import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/constants";
import { DEMO } from "@/lib/demo/flag";

// Design preview: tells the in-browser demo backend who is signed in, from the signed session cookie.
export async function GET() {
  if (!DEMO) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const token = cookies().get(SESSION_COOKIE)?.value;
  const s = token ? await verifySession(token) : null;
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ id: s.sub, role: s.role, name: s.name });
}

export const dynamic = "force-dynamic";
