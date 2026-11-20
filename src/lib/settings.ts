import { prisma } from "@/lib/db";
import { compareSemesters } from "@/lib/semesters";

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

export { compareSemesters };
