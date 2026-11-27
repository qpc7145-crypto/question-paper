import { z } from "zod";
import { body, ok, route } from "@/server/core/http";
import { issueSession } from "@/server/auth/guard";
import { login } from "@/server/modules/auth/service";
import { ROLE_HOME } from "@/lib/constants";

export const POST = route(async (req: Request) => {
  const { email, password } = await body(req, z.object({ email: z.string().email(), password: z.string().min(1).max(200) }));
  const { user, profileComplete } = await login(email, password);
  await issueSession(user, profileComplete);
  return ok({ redirect: user.role === "SETTER" && !profileComplete ? "/setter/biodata" : ROLE_HOME[user.role] });
});

export const dynamic = "force-dynamic";
