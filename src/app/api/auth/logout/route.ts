import { audit } from "@/lib/audit";
import { clearSession, getSessionUser } from "@/lib/auth/server";
import { ok, route } from "@/lib/http";

export const POST = route(async () => {
  const u = await getSessionUser();
  if (u) await audit({ actor: u, action: "LOGOUT" });
  clearSession();
  return ok({ ok: true });
});
