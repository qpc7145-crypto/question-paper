import { z } from "zod";
import { body, ok, route } from "@/server/core/http";
import { issueSession, requireUser } from "@/server/auth/guard";
import { changePassword } from "@/server/modules/auth/service";

export const POST = route(async (req: Request) => {
  const u = await requireUser();
  const input = await body(req, z.object({ current: z.string().max(200), password: z.string().max(200) }));
  const updated = await changePassword(u, input.current, input.password);
  await issueSession(updated, u.profileComplete); // keep this session, revoke others
  return ok({ message: "Password changed" });
});

export const dynamic = "force-dynamic";
