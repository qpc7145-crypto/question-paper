import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/server/auth/session";
import { ROLE_HOME, SESSION_COOKIE, type Role } from "@/lib/constants";
import { DEMO } from "@/lib/demo/flag";

// Page-level RBAC. API routes perform their own (database-backed) checks too.
const AREA: Record<string, Role> = {
  "/controller": "CONTROLLER",
  "/setter": "SETTER",
  "/typist": "TYPIST",
  "/centre": "SUPERINTENDENT",
};

const PUBLIC = ["/login", "/forgot-password"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    // Design preview: no backend. Links to files and exports get a placeholder page instead.
    if (DEMO && !pathname.startsWith("/api/demo/") && pathname !== "/api/auth/logout") {
      const url = new URL("/api/demo/unavailable", req.url);
      const headers = new Headers(req.headers);
      headers.set("x-demo-from", pathname + req.nextUrl.search);
      return NextResponse.rewrite(url, { request: { headers } });
    }
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    if (session) return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
    return NextResponse.next();
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(session ? ROLE_HOME[session.role] : "/login", req.url));
  }

  if (pathname.startsWith("/account") && !session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const area = Object.keys(AREA).find((p) => pathname === p || pathname.startsWith(p + "/"));
  if (area) {
    if (!session) {
      const url = new URL("/login", req.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (session.role !== AREA[area]) return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
    // FR-4 gate: setters must complete bio-data first.
    if (session.role === "SETTER" && !session.pc && !pathname.startsWith("/setter/biodata")) {
      return NextResponse.redirect(new URL("/setter/biodata", req.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
