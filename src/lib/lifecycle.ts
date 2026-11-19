import type { PaperStatus, Role } from "@/lib/constants";
import { HttpError } from "@/lib/http";

// Paper state machine (SRS 3.8):
// DRAFT -> SUBMITTED -> UNDER_MODIFICATION (Controller edit / Typist modification)
//       -> SENT_TO_CENTRE -> USED -> ARCHIVED
const TRANSITIONS: Record<PaperStatus, PaperStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_MODIFICATION", "SENT_TO_CENTRE"],
  UNDER_MODIFICATION: ["SENT_TO_CENTRE"],
  SENT_TO_CENTRE: ["USED", "UNDER_MODIFICATION"], // recall allowed only before any centre access
  USED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function assertTransition(from: string, to: PaperStatus) {
  if (!TRANSITIONS[from as PaperStatus]?.includes(to)) {
    throw new HttpError(409, `Paper cannot move from ${from} to ${to}`);
  }
}

export function canEditContent(role: Role, status: string) {
  if (role === "SETTER") return status === "DRAFT";
  if (role === "CONTROLLER" || role === "TYPIST") return status === "SUBMITTED" || status === "UNDER_MODIFICATION";
  return false;
}

export function assertEditable(role: Role, status: string) {
  if (status === "ARCHIVED") throw new HttpError(423, "Archived papers are permanently locked");
  if (status === "USED") throw new HttpError(423, "Paper is locked after use");
  if (!canEditContent(role, status)) throw new HttpError(409, `Paper is not editable while ${status}`);
}

export const canSendFromStatus = (status: string) => status === "SUBMITTED" || status === "UNDER_MODIFICATION";

export function hasContent(p: { format: string; mode: string; contentHtml: string; sectionAHtml: string; sectionBHtml: string; sectionCHtml: string; fileId: string | null }) {
  if (p.format === "FILE") return !!p.fileId;
  const text = (s: string) => s.replace(/<[^>]*>/g, "").trim().length > 0;
  return p.mode === "STRUCTURED"
    ? text(p.sectionAHtml) || text(p.sectionBHtml) || text(p.sectionCHtml)
    : text(p.contentHtml);
}
