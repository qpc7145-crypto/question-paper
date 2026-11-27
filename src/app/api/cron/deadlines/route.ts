import { ok, route } from "@/server/core/http";
import { assertCronRequest } from "@/server/modules/notifications/cron";
import { queueDeadlineReminders } from "@/server/modules/notifications/reminders";
import { deliverOutbox } from "@/server/modules/notifications/outbox";

// Daily (vercel.json): queue deadline reminders, then deliver everything due in the outbox,
// including retries of earlier failures.
export const GET = route(async (req: Request) => {
  assertCronRequest(req);
  const reminders = await queueDeadlineReminders();
  return ok({ reminders, delivery: await deliverOutbox() });
});

export const dynamic = "force-dynamic";
