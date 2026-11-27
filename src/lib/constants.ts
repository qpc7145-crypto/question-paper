export const ROLES = ["CONTROLLER", "SETTER", "TYPIST", "SUPERINTENDENT"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  CONTROLLER: "Controller of Examination",
  SETTER: "Paper Setter",
  TYPIST: "Paper Typist",
  SUPERINTENDENT: "Centre Superintendent",
};

export const ROLE_HOME: Record<Role, string> = {
  CONTROLLER: "/controller",
  SETTER: "/setter",
  TYPIST: "/typist",
  SUPERINTENDENT: "/centre",
};

export const PAPER_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_MODIFICATION",
  "SENT_TO_CENTRE",
  "USED",
  "ARCHIVED",
] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

export const STATUS_LABEL: Record<PaperStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_MODIFICATION: "Under Modification",
  SENT_TO_CENTRE: "Sent to Centre",
  USED: "Used",
  ARCHIVED: "Archived",
};

export const EXAM_TYPES = ["MIDTERM", "FINAL", "SUPPLEMENTARY", "SPECIAL"] as const;

export const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "ACCOUNT_CREATED",
  "ACCOUNT_UPDATED",
  "BIODATA_UPDATED",
  "SUBJECT_CREATED",
  "SUBJECT_UPDATED",
  "SETTER_ASSIGNED",
  "TYPIST_ASSIGNED",
  "DELEGATION_CHANGED",
  "CENTRES_ASSIGNED",
  "CENTRE_CREATED",
  "CENTRE_UPDATED",
  "PAPER_DRAFT_SAVED",
  "PAPER_SUBMITTED",
  "PAPER_EDITED",
  "PAPER_FILE_UPLOADED",
  "PAPER_SENT_TO_CENTRE",
  "PAPER_RECALLED",
  "PAPER_ACCESSED",
  "PAPER_DOWNLOADED",
  "PAPER_MARKED_USED",
  "PAPER_ARCHIVED",
  "MODEL_RELEASE_CHANGED",
  "RESOURCE_UPLOADED",
  "RESOURCE_DELETED",
  "RESOURCE_DOWNLOADED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "PASSWORD_RESET_FAILED",
  "PASSWORD_CHANGED",
  "SETTINGS_UPDATED",
  "AUDIT_EXPORTED",
  "INTEGRATION_CALL",
  "API_CLIENT_CREATED",
  "API_CLIENT_REVOKED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const SESSION_COOKIE = "qpb_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // one working day
