import crypto from "node:crypto";
import { HttpError } from "@/server/core/http";

// Vercel Cron calls these routes with "Authorization: Bearer $CRON_SECRET".
export function assertCronRequest(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new HttpError(503, "Scheduled jobs are disabled: CRON_SECRET is not configured");
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw new HttpError(401, "Unauthorized");
}
