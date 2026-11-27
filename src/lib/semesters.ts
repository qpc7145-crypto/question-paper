// Semester labels are "Spring 2026", "Summer 2026", "Fall 2026" or "Winter 2026" (FR-6).
export const SEMESTER_PATTERN = "(Spring|Summer|Fall|Winter) [0-9]{4}";
export const SEMESTER_RE = /^(Spring|Summer|Fall|Winter) \d{4}$/;
export const SEMESTER_HINT = "Season and year, e.g. Fall 2026";

// Years outside this range are typos ("Fall 1850", "Fall 9999"), not real semesters.
export const MIN_SEMESTER_YEAR = 2000;
export const semesterYear = (s: string) => Number(s.slice(-4));
export function isValidSemester(s: string, now = new Date()) {
  if (!SEMESTER_RE.test(s)) return false;
  const y = semesterYear(s);
  return y >= MIN_SEMESTER_YEAR && y <= now.getFullYear() + 5;
}

// Sort newest first; unknown formats alphabetically.
export function compareSemesters(a: string, b: string) {
  const parse = (s: string) => {
    const m = s.match(/(spring|summer|fall|winter)\s*(\d{4})/i);
    if (!m) return null;
    const order = { spring: 1, summer: 2, fall: 3, winter: 4 } as Record<string, number>;
    return Number(m[2]) * 10 + order[m[1].toLowerCase()];
  };
  const pa = parse(a), pb = parse(b);
  if (pa !== null && pb !== null) return pb - pa;
  return a.localeCompare(b);
}

// FR-18: a centre's unlock time must be in the future and no earlier than this long before the exam starts.
export const UNLOCK_LEAD_MINUTES = 60;

export function unlockTimeError(at: Date, examDate: Date, centre: string, nowMs = Date.now()) {
  if (isNaN(+at)) return `Enter an unlock time for ${centre}`;
  if (at.getTime() <= nowMs) return `The unlock time for ${centre} is in the past. Choose a time at or near the exam start.`;
  if (at.getTime() < examDate.getTime() - UNLOCK_LEAD_MINUTES * 60_000) {
    return `The unlock time for ${centre} is more than ${UNLOCK_LEAD_MINUTES} minutes before the exam starts.`;
  }
  if (at.getTime() > examDate.getTime()) {
    return `The unlock time for ${centre} is after the exam starts. The centre must have the paper by the exam start.`;
  }
  return null;
}
