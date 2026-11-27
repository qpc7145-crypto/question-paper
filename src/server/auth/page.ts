import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, type Role } from "@/lib/constants";
import { verifySession } from "@/server/auth/session";

// For server layouts: read the (already middleware-checked) session claims.
export async function pageSession(role?: Role) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const s = token ? await verifySession(token) : null;
  if (!s) redirect("/login");
  if (role && s.role !== role) redirect("/");
  return s;
}
