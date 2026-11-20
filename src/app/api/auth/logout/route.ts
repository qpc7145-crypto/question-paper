import { audit } from "@/lib/audit";
import { clearSession, getSessionUser } from "@/lib/auth/server";
import { ok, route } from "@/lib/http";
import { DEMO } from "@/lib/demo/flag";

export const POST = route(async () => {
  const u = DEMO ? null : await getSessionUser();
  if (u) await audit({ actor: u, action: "LOGOUT" });
  clearSession();
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
