import { requireUser } from "@/lib/auth/server";
import { ok, route } from "@/lib/http";

export const GET = route(async () => {
  const u = await requireUser();
  return ok({ user: { email: u.email, role: u.role, displayName: u.displayName, profileComplete: u.profileComplete } });
});
