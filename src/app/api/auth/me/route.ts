import { requireUser } from "@/server/auth/guard";
import { ok, route } from "@/server/core/http";

export const GET = route(async () => {
  const u = await requireUser();
  return ok({ user: { email: u.email, role: u.role, displayName: u.displayName, profileComplete: u.profileComplete } });
});

export const dynamic = "force-dynamic";
