import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { ROLE_HOME, SESSION_COOKIE, type Role } from "@/lib/constants";

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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
