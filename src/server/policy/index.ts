// Access policy: the ONLY place that decides which papers and resources a user can see.
//
// Every read of a paper goes through a scope (a Prisma where clause) combined with the
// requested id, so a paper outside the caller's scope is simply "not found". There is no
// separate in-memory check to forget or to drift out of sync with the list queries.
// (QA-01..QA-04 were all hand-written ownership checks missing from one route or another.)
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/server/auth/guard";
import { HttpError } from "@/server/core/http";

export type Actor = SessionUser;

// "list": rows a user sees in their own paper list.
// "read": opening one paper (detail, preview, editing, file upload, sending).
export type PaperPurpose = "list" | "read";

const NOTHING: Prisma.PaperWhereInput = { id: { in: [] } };

// A paper exists, as far as anyone can tell, while a setter is assigned to it. Unassigning
// the setter of a draft hides the paper but keeps its versions; re-assigning continues it.
const HAS_SETTER: Prisma.PaperWhereInput = { assignments: { some: { role: "SETTER", revokedAt: null } } };

const assignedTo = (userId: string, role: "SETTER" | "TYPIST"): Prisma.PaperWhereInput => ({
  assignments: { some: { userId, role, revokedAt: null } },
});

export function paperScope(actor: Actor, purpose: PaperPurpose): Prisma.PaperWhereInput {
  switch (actor.role) {
    case "CONTROLLER":
      return HAS_SETTER;
    case "SETTER":
      // FR-4: nothing before bio-data is on file.
      if (!actor.profileComplete) throw new HttpError(403, "Complete your bio-data before accessing paper assignments");
      // Own papers only. Archived papers stay in the list (shown as Used) but cannot be opened.
      return purpose === "list"
        ? assignedTo(actor.id, "SETTER")
        : { AND: [assignedTo(actor.id, "SETTER"), { status: { not: "ARCHIVED" } }] };
    case "TYPIST":
      // Assigned papers only. The list shows upcoming drafts (metadata only) so the typist
      // can plan; the content is reachable only once the setter has submitted it.
      return {
        AND: [
          HAS_SETTER,
          assignedTo(actor.id, "TYPIST"),
          { status: purpose === "list" ? { not: "ARCHIVED" } : { notIn: ["DRAFT", "ARCHIVED"] } },
        ],
      };
    case "SUPERINTENDENT":
      // Centres never use the generic paper routes; their access is per assignment
      // (centreAssignmentScope) and time-gated in the distribution module.
      return NOTHING;
  }
}

// Combine with an id for single-paper lookups: findFirst({ where: paperById(actor, id, "read") }).
export const paperById = (actor: Actor, id: string, purpose: PaperPurpose = "read"): Prisma.PaperWhereInput => ({
  AND: [{ id }, paperScope(actor, purpose)],
});

// FR-18: a centre sees its own assignments for papers that have been sent.
export function centreAssignmentScope(centreId: string): Prisma.PaperCentreWhereInput {
  return { centreId, paper: { status: { in: ["SENT_TO_CENTRE", "USED"] } } };
}

// FR-13: who may send a visible paper to its centres.
export function assertCanSend(actor: Actor, p: { typistId: string | null; typistCanSend: boolean }) {
  if (actor.role === "CONTROLLER") return;
  if (actor.role === "TYPIST" && p.typistId === actor.id && p.typistCanSend) return;
  throw new HttpError(403, "You are not delegated to send this paper");
}

// FR-22: a released model paper is USED, explicitly released, and not from the current semester.
export const MODEL_PAPER_SCOPE: Prisma.PaperWhereInput = {
  AND: [HAS_SETTER, { status: "USED", releasedAsModel: true, exam: { term: { isCurrent: false } } }],
};

// FR-16: setters see general syllabi, syllabi of the exams they set, and every model paper.
export function resourceScope(actor: Actor): Prisma.ResourceWhereInput {
  if (actor.role === "CONTROLLER") return {};
  if (actor.role === "SETTER") {
    if (!actor.profileComplete) throw new HttpError(403, "Complete your bio-data first");
    return {
      OR: [
        { kind: "MODEL_PAPER" },
        { kind: "SYLLABUS", examId: null },
        { kind: "SYLLABUS", exam: { paper: assignedTo(actor.id, "SETTER") } },
      ],
    };
  }
  return { id: { in: [] } };
}
