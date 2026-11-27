import { clearSession, getSessionUser } from "@/server/auth/guard";
import { ok, route } from "@/server/core/http";
import { auditLogout } from "@/server/modules/auth/service";
import { DEMO } from "@/lib/demo/flag";

export const POST = route(async () => {
  const u = DEMO ? null : await getSessionUser();
  if (u) await auditLogout(u);
  clearSession();
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
