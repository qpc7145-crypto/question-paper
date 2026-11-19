import { prisma } from "@/lib/db";

export const SETTING_KEYS = {
  currentSemester: "currentSemester",
  institutionName: "institutionName",
} as const;

export async function getSetting(key: string, fallback = "") {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export const getCurrentSemester = () => getSetting(SETTING_KEYS.currentSemester, "");
export const getInstitutionName = () => getSetting(SETTING_KEYS.institutionName, "Examinations Department");

export async function listSemesters(): Promise<string[]> {
  const rows = await prisma.subject.findMany({ distinct: ["semester"], select: { semester: true } });
  return rows.map((r) => r.semester).sort(compareSemesters);
}

// Sort "Spring 2026" / "Fall 2026" style labels newest first; unknown formats alphabetically.
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
