// Sample data for the frontend-only demo (NEXT_PUBLIC_DEMO_MODE=1).
// Everything here is fictional. Dates are relative to "now" so countdowns and deadlines look live.
import type { Role } from "@/lib/constants";

export { DEMO } from "./flag";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

export const CURRENT_SEMESTER = "Fall 2026";
export const SEMESTERS = ["Fall 2026", "Spring 2026", "Fall 2025"];
export const INSTITUTION = "Government College of Examinations, Lahore";

export const DEMO_USERS: Record<Role, { id: string; name: string; email: string }> = {
  CONTROLLER: { id: "u-ctrl", name: "Dr. Ayesha Malik", email: "controller@qpbank.edu" },
  SETTER: { id: "u-set1", name: "Prof. Imran Qureshi", email: "setter1@qpbank.edu" },
  TYPIST: { id: "u-typ", name: "Bilal Ahmed", email: "typist@qpbank.edu" },
  SUPERINTENDENT: { id: "u-cen1", name: "Saima Rauf", email: "centre.a@qpbank.edu" },
};

export const CENTRES = [
  { id: "c-1", code: "LHR-01", name: "Government College Hall A", address: "Lower Mall", city: "Lahore", capacity: 450, supId: "u-cen1" },
  { id: "c-2", code: "LHR-02", name: "Punjab Science Block", address: "Jail Road", city: "Lahore", capacity: 300, supId: "u-cen2" },
  { id: "c-3", code: "FSD-01", name: "Faisalabad Exam Centre", address: "Canal Road", city: "Faisalabad", capacity: 260, supId: null as string | null },
];

export type DemoUser = {
  id: string; email: string; role: Role; displayName: string; isActive: boolean; locked: boolean; lastLoginAt: string | null;
  setterProfile: null | { fullName: string; cnic: string; qualification: string; institution: string; experienceYears: number; specialization: string; phone: string; address: string; subjectsEligible: string };
  superintendent: null | { fullName: string; cnic: string; designation: string; organization: string; phone: string; address: string };
};

export const USERS: DemoUser[] = [
  {
    id: "u-set1", email: "setter1@qpbank.edu", role: "SETTER", displayName: "Prof. Imran Qureshi", isActive: true, locked: false, lastLoginAt: at(-2 * HOUR),
    setterProfile: { fullName: "Prof. Imran Qureshi", cnic: "35202-1234567-1", qualification: "PhD Computer Science", institution: "University of the Punjab", experienceYears: 14, specialization: "Algorithms", phone: "+92 300 1234567", address: "12-B Model Town, Lahore", subjectsEligible: "CS-201, CS-301, MATH-201" },
    superintendent: null,
  },
  {
    id: "u-set2", email: "setter2@qpbank.edu", role: "SETTER", displayName: "Dr. Hina Javed", isActive: true, locked: false, lastLoginAt: null,
    setterProfile: null, superintendent: null,
  },
  {
    id: "u-set3", email: "setter3@qpbank.edu", role: "SETTER", displayName: "Dr. Usman Tariq", isActive: true, locked: false, lastLoginAt: at(-3 * DAY),
    setterProfile: { fullName: "Dr. Usman Tariq", cnic: "35201-7654321-3", qualification: "PhD English Literature", institution: "Government College University", experienceYears: 9, specialization: "Linguistics", phone: "+92 321 7654321", address: "45 Gulberg III, Lahore", subjectsEligible: "ENG-101, ENG-205" },
    superintendent: null,
  },
  { id: "u-typ", email: "typist@qpbank.edu", role: "TYPIST", displayName: "Bilal Ahmed", isActive: true, locked: false, lastLoginAt: at(-5 * HOUR), setterProfile: null, superintendent: null },
  { id: "u-typ2", email: "typist2@qpbank.edu", role: "TYPIST", displayName: "Nadia Shah", isActive: false, locked: false, lastLoginAt: at(-40 * DAY), setterProfile: null, superintendent: null },
  {
    id: "u-cen1", email: "centre.a@qpbank.edu", role: "SUPERINTENDENT", displayName: "Saima Rauf", isActive: true, locked: false, lastLoginAt: at(-1 * DAY),
    setterProfile: null,
    superintendent: { fullName: "Saima Rauf", cnic: "35202-2345678-4", designation: "Senior Lecturer", organization: "Government College Lahore", phone: "+92 333 2345678", address: "Lower Mall, Lahore" },
  },
  { id: "u-cen2", email: "centre.b@qpbank.edu", role: "SUPERINTENDENT", displayName: "Kamran Ali", isActive: true, locked: true, lastLoginAt: at(-6 * DAY), setterProfile: null, superintendent: null },
];

const MATH_HTML =
  "<p><strong>Q1.</strong> Solve the system of linear equations using Gaussian elimination:</p><p>2x + 3y − z = 5, &nbsp; 4x − y + 2z = 6, &nbsp; x + y + z = 4.</p><p><strong>Q2.</strong> Find the eigenvalues and eigenvectors of the matrix A = [[2, 1], [1, 2]].</p><p><strong>Q3.</strong> Prove that every symmetric matrix has real eigenvalues.</p>";

const STRUCT = {
  a: "<ol><li>Define an algorithm and state its five properties.</li><li>What is the time complexity of binary search?</li><li>Differentiate between a stack and a queue.</li></ol>",
  b: "<ol><li>Explain merge sort with a worked example on [38, 27, 43, 3, 9, 82, 10].</li><li>Write pseudocode for breadth-first search and analyse its complexity.</li></ol>",
  c: "<ol><li>Design a dynamic-programming solution for the 0/1 knapsack problem. Prove its correctness and give its running time.</li></ol>",
};

export type DemoPaper = {
  id: string; status: string;
  subject: { id: string; code: string; title: string; semester: string; examType: string; examDate: string; submissionDeadline: string };
  setterId: string; typistId: string | null; typistCanSend: boolean;
  format: string; mode: string; contentHtml: string; sectionAHtml: string; sectionBHtml: string; sectionCHtml: string;
  instructions: string; totalMarks: number | null; durationMinutes: number | null;
  file: { name: string; sizeBytes: number } | null;
  centres: { centreId: string; availableFrom: string; firstAccessAt: string | null; firstDownloadAt: string | null; downloadCount: number }[];
  revisions: { id: string; editorRole: string; editorName: string; note: string; createdAt: string }[];
  submittedAt: string | null; isLate: boolean; sentAt: string | null; usedAt: string | null; archivedAt: string | null; releasedAsModel: boolean;
};

const blank = { contentHtml: "", sectionAHtml: "", sectionBHtml: "", sectionCHtml: "", file: null, revisions: [], centres: [] };

export const PAPERS: DemoPaper[] = [
  {
    ...blank, id: "p-eng101", status: "SENT_TO_CENTRE",
    subject: { id: "s-eng101", code: "ENG-101", title: "Functional English", semester: CURRENT_SEMESTER, examType: "FINAL", examDate: at(3 * MIN), submissionDeadline: at(-10 * DAY) },
    setterId: "u-set3", typistId: "u-typ", typistCanSend: false, format: "RICH_TEXT", mode: "FREE",
    contentHtml: "<p><strong>Q1.</strong> Write an essay of 300 words on <em>“The role of technology in education”</em>.</p><p><strong>Q2.</strong> Read the passage below and answer the questions that follow.</p><p><strong>Q3.</strong> Correct the following sentences.</p>",
    instructions: "Attempt all questions. Use of mobile phones is strictly prohibited.", totalMarks: 75, durationMinutes: 180,
    centres: [
      { centreId: "c-1", availableFrom: at(3 * MIN), firstAccessAt: null, firstDownloadAt: null, downloadCount: 0 },
      { centreId: "c-2", availableFrom: at(3 * MIN), firstAccessAt: null, firstDownloadAt: null, downloadCount: 0 },
    ],
    revisions: [{ id: "r-1", editorRole: "TYPIST", editorName: "Bilal Ahmed", note: "Formatting and numbering", createdAt: at(-6 * DAY) }],
    submittedAt: at(-11 * DAY), isLate: false, sentAt: at(-2 * DAY), usedAt: null, archivedAt: null, releasedAsModel: false,
  },
  {
    ...blank, id: "p-math201", status: "UNDER_MODIFICATION",
    subject: { id: "s-math201", code: "MATH-201", title: "Linear Algebra", semester: CURRENT_SEMESTER, examType: "MIDTERM", examDate: at(5 * DAY), submissionDeadline: at(-1 * DAY) },
    setterId: "u-set1", typistId: "u-typ", typistCanSend: true, format: "RICH_TEXT", mode: "FREE", contentHtml: MATH_HTML,
    instructions: "Attempt any FOUR questions. All questions carry equal marks.", totalMarks: 50, durationMinutes: 120,
    centres: [{ centreId: "c-1", availableFrom: at(5 * DAY), firstAccessAt: null, firstDownloadAt: null, downloadCount: 0 }],
    revisions: [
      { id: "r-2", editorRole: "CONTROLLER", editorName: "Dr. Ayesha Malik", note: "Q3 wording clarified", createdAt: at(-20 * HOUR) },
      { id: "r-3", editorRole: "TYPIST", editorName: "Bilal Ahmed", note: "Equations retyped", createdAt: at(-8 * HOUR) },
    ],
    submittedAt: at(-2 * DAY), isLate: false, sentAt: null, usedAt: null, archivedAt: null, releasedAsModel: false,
  },
  {
    ...blank, id: "p-cs301", status: "DRAFT",
    subject: { id: "s-cs301", code: "CS-301", title: "Design & Analysis of Algorithms", semester: CURRENT_SEMESTER, examType: "FINAL", examDate: at(18 * DAY), submissionDeadline: at(6 * DAY) },
    setterId: "u-set1", typistId: null, typistCanSend: false, format: "RICH_TEXT", mode: "STRUCTURED",
    sectionAHtml: STRUCT.a, sectionBHtml: STRUCT.b, sectionCHtml: STRUCT.c,
    instructions: "Section A is compulsory. Attempt any TWO questions from Section B and ONE from Section C.", totalMarks: 100, durationMinutes: 180,
    submittedAt: null, isLate: false, sentAt: null, usedAt: null, archivedAt: null, releasedAsModel: false,
  },
  {
    ...blank, id: "p-cs201", status: "DRAFT",
    subject: { id: "s-cs201", code: "CS-201", title: "Data Structures", semester: CURRENT_SEMESTER, examType: "MIDTERM", examDate: at(4 * DAY), submissionDeadline: at(-2 * DAY) },
    setterId: "u-set1", typistId: null, typistCanSend: false, format: "RICH_TEXT", mode: "FREE",
    contentHtml: "<p><strong>Q1.</strong> Implement a singly linked list with insert and delete operations.</p>",
    instructions: "", totalMarks: 50, durationMinutes: 90,
    submittedAt: null, isLate: false, sentAt: null, usedAt: null, archivedAt: null, releasedAsModel: false,
  },
  {
    ...blank, id: "p-phy110", status: "SUBMITTED",
    subject: { id: "s-phy110", code: "PHY-110", title: "Mechanics", semester: CURRENT_SEMESTER, examType: "FINAL", examDate: at(12 * DAY), submissionDeadline: at(-3 * DAY) },
    setterId: "u-set3", typistId: null, typistCanSend: false, format: "FILE", mode: "FREE",
    file: { name: "PHY-110 final paper.pdf", sizeBytes: 412_300 },
    instructions: "Attempt all questions.", totalMarks: 100, durationMinutes: 180,
    submittedAt: at(-1 * DAY), isLate: true, sentAt: null, usedAt: null, archivedAt: null, releasedAsModel: false,
  },
  {
    ...blank, id: "p-cs101", status: "USED",
    subject: { id: "s-cs101", code: "CS-101", title: "Introduction to Computing", semester: "Spring 2026", examType: "FINAL", examDate: at(-120 * DAY), submissionDeadline: at(-135 * DAY) },
    setterId: "u-set1", typistId: "u-typ", typistCanSend: false, format: "RICH_TEXT", mode: "FREE",
    contentHtml: "<p><strong>Q1.</strong> Explain the von Neumann architecture with a labelled diagram.</p><p><strong>Q2.</strong> Convert (156)<sub>10</sub> to binary, octal and hexadecimal.</p>",
    instructions: "Attempt all questions.", totalMarks: 75, durationMinutes: 180,
    centres: [
      { centreId: "c-1", availableFrom: at(-120 * DAY), firstAccessAt: at(-120 * DAY + 2 * MIN), firstDownloadAt: at(-120 * DAY + 3 * MIN), downloadCount: 2 },
      { centreId: "c-2", availableFrom: at(-120 * DAY), firstAccessAt: at(-120 * DAY + 9 * MIN), firstDownloadAt: at(-120 * DAY + 11 * MIN), downloadCount: 1 },
    ],
    submittedAt: at(-136 * DAY), isLate: false, sentAt: at(-125 * DAY), usedAt: at(-120 * DAY + 3 * MIN), archivedAt: null, releasedAsModel: true,
  },
  {
    ...blank, id: "p-eng205", status: "ARCHIVED",
    subject: { id: "s-eng205", code: "ENG-205", title: "English Literature", semester: "Fall 2025", examType: "FINAL", examDate: at(-300 * DAY), submissionDeadline: at(-315 * DAY) },
    setterId: "u-set3", typistId: "u-typ", typistCanSend: false, format: "RICH_TEXT", mode: "FREE",
    contentHtml: "<p><strong>Q1.</strong> Critically analyse the themes of <em>Hamlet</em>.</p>",
    instructions: "Attempt any three questions.", totalMarks: 100, durationMinutes: 180,
    centres: [{ centreId: "c-1", availableFrom: at(-300 * DAY), firstAccessAt: at(-300 * DAY + 4 * MIN), firstDownloadAt: at(-300 * DAY + 4 * MIN), downloadCount: 1 }],
    submittedAt: at(-316 * DAY), isLate: false, sentAt: at(-305 * DAY), usedAt: at(-300 * DAY + 4 * MIN), archivedAt: at(-280 * DAY), releasedAsModel: false,
  },
];

export const UNASSIGNED_SUBJECTS = [
  { id: "s-cs401", code: "CS-401", title: "Operating Systems", semester: CURRENT_SEMESTER, examType: "FINAL", examDate: at(25 * DAY), submissionDeadline: at(10 * DAY) },
];

export const RESOURCES = [
  { id: "res-1", kind: "SYLLABUS", title: "Paper-setting guidelines 2026", semester: null as string | null, subjectId: null as string | null, createdAt: at(-30 * DAY), file: { originalName: "guidelines-2026.pdf", sizeBytes: 245_000 } },
  { id: "res-2", kind: "SYLLABUS", title: "CS-301 course outline", semester: CURRENT_SEMESTER, subjectId: "s-cs301", createdAt: at(-25 * DAY), file: { originalName: "cs301-outline.pdf", sizeBytes: 180_500 } },
  { id: "res-3", kind: "MODEL_PAPER", title: "Linear Algebra model paper", semester: "Spring 2026", subjectId: "s-math201", createdAt: at(-20 * DAY), file: { originalName: "math201-model.docx", sizeBytes: 96_200 } },
];

const AUDIT_ACTIONS_SAMPLE: [string, string | null, string | null, string | null][] = [
  ["LOGIN_SUCCESS", "controller@qpbank.edu", "CONTROLLER", null],
  ["PAPER_EDITED", "typist@qpbank.edu", "TYPIST", "Paper"],
  ["LOGIN_FAILED", "unknown@example.com", null, null],
  ["PAPER_SUBMITTED", "setter3@qpbank.edu", "SETTER", "Paper"],
  ["PAPER_SENT", "controller@qpbank.edu", "CONTROLLER", "Paper"],
  ["CENTRES_ASSIGNED", "controller@qpbank.edu", "CONTROLLER", "Paper"],
  ["TYPIST_ASSIGNED", "controller@qpbank.edu", "CONTROLLER", "Paper"],
  ["LOGIN_SUCCESS", "setter1@qpbank.edu", "SETTER", null],
  ["BIODATA_UPDATED", "setter1@qpbank.edu", "SETTER", "User"],
  ["USER_CREATED", "controller@qpbank.edu", "CONTROLLER", "User"],
  ["RESOURCE_UPLOADED", "controller@qpbank.edu", "CONTROLLER", "Resource"],
  ["LOGIN_SUCCESS", "centre.a@qpbank.edu", "SUPERINTENDENT", null],
];

export const AUDIT = Array.from({ length: 64 }, (_, i) => {
  const [action, userEmail, role, entity] = AUDIT_ACTIONS_SAMPLE[i % AUDIT_ACTIONS_SAMPLE.length];
  const seq = 64 - i;
  return {
    seq, at: at(-(i * 3 + 1) * HOUR), userEmail, role, action, entity,
    entityId: entity ? `ckx${(seq * 7919).toString(36)}demo${seq}` : null,
    details: JSON.stringify(action === "LOGIN_FAILED" ? { reason: "unknown_account" } : entity ? { note: "Demo entry" } : {}),
    ip: `10.0.${seq % 8}.${(seq * 13) % 250}`,
    hash: Array.from({ length: 64 }, (_, k) => "0123456789abcdef"[(seq * 31 + k * 17) % 16]).join(""),
  };
});

export const centreById = (id: string) => CENTRES.find((c) => c.id === id)!;
export const userById = (id: string | null) => (id ? USERS.find((u) => u.id === id) ?? null : null);
