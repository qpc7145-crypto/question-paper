import { prisma } from "@/server/core/db";
import { termLabel } from "@/server/modules/academics/terms";
import { enqueueEmails } from "./outbox";

const WINDOW_HOURS = 48;

// Daily job: remind each setter whose paper is still a draft and due within 48 hours.
// The dedupe key includes the deadline, so a rescheduled deadline earns a fresh reminder
// while re-running the job the same day sends nothing twice.
export async function queueDeadlineReminders(now = new Date()) {
  const until = new Date(now.getTime() + WINDOW_HOURS * 3600_000);
  const drafts = await prisma.paper.findMany({
    where: { status: "DRAFT", exam: { submissionDeadline: { gt: now, lte: until } } },
    select: {
      id: true,
      exam: { select: { title: true, examType: true, submissionDeadline: true, course: { select: { code: true } }, term: true } },
      assignments: { where: { role: "SETTER", revokedAt: null }, select: { user: { select: { email: true, displayName: true, isActive: true } } } },
    },
  });
  const emails = drafts.flatMap((p) => {
    const setter = p.assignments[0]?.user;
    if (!setter?.isActive) return [];
    const due = p.exam.submissionDeadline;
    const label = `${p.exam.course.code} — ${p.exam.title} (${p.exam.examType}, ${termLabel(p.exam.term)})`;
    return [{
      kind: "DEADLINE_REMINDER",
      to: setter.email,
      subject: `Reminder: ${p.exam.course.code} paper due ${due.toISOString().slice(0, 10)}`,
      body:
        `Dear ${setter.displayName},\n\nYour question paper for ${label} has not been submitted yet. ` +
        `The submission deadline is ${due.toISOString().replace("T", " ").slice(0, 16)} UTC.\n\n` +
        `Please sign in to the Question Paper Bank to complete and submit it.\n\nExaminations Office`,
      dedupeKey: `deadline:${p.id}:${due.toISOString()}`,
    }];
  });
  return { candidates: drafts.length, queued: await enqueueEmails(prisma, emails) };
}
