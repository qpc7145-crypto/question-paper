import { z } from "zod";
import { body, ok, route } from "@/server/core/http";
import { requestPasswordReset } from "@/server/modules/auth/service";

// FR-3: self-service reset — step 1, email a 6-digit OTP. No Controller approval.
// The response is identical whether or not the account exists (no user enumeration).
export const POST = route(async (req: Request) => {
  const { email } = await body(req, z.object({ email: z.string().email() }));
  await requestPasswordReset(email);
  return ok({ message: "If an account exists for this email, a 6-digit code has been sent." });
});

export const dynamic = "force-dynamic";
