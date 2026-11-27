import { z } from "zod";
import { body, ok, route } from "@/server/core/http";
import { resetPassword } from "@/server/modules/auth/service";

// FR-3 step 2: verify OTP and set a new password. Every outcome is logged.
export const POST = route(async (req: Request) => {
  const input = await body(
    req,
    z.object({ email: z.string().email(), otp: z.string().regex(/^\d{6}$/), password: z.string().max(200) }),
  );
  await resetPassword(input.email, input.otp, input.password);
  return ok({ message: "Password updated. You can now sign in." });
});

export const dynamic = "force-dynamic";
