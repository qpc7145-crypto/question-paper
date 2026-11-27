import { z } from "zod";
import { body, ok, route } from "@/server/core/http";
import { issueSession, requireUser } from "@/server/auth/guard";
import { updateDisplayName } from "@/server/modules/auth/service";

// Any signed-in user can change their own display name (shown in the sidebar and on records they create).
export const PATCH = route(async (req: Request) => {
  const u = await requireUser();
  const input = await body(req, z.object({ displayName: z.string().trim().min(2, "Display name must be at least 2 characters").max(120) }));
  const updated = await updateDisplayName(u, input.displayName);
  await issueSession(updated, u.profileComplete); // the sidebar reads the name from the session
  return ok({ displayName: updated.displayName });
});

export const dynamic = "force-dynamic";
