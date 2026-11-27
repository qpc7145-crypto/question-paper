import { ok, route } from "@/server/core/http";
import { assertCronRequest } from "@/server/modules/notifications/cron";
import { deliverOutbox } from "@/server/modules/notifications/outbox";

// Delivers due outbox messages. Not scheduled by default (the daily deadlines job also
// delivers); on a Vercel plan with sub-daily crons, schedule this e.g. every 10 minutes.
export const GET = route(async (req: Request) => {
  assertCronRequest(req);
  return ok(await deliverOutbox());
});

export const dynamic = "force-dynamic";
