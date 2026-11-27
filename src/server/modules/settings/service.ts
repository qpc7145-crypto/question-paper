import { prisma, withTx } from "@/server/core/db";
import { HttpError } from "@/server/core/http";
import { writeAudit } from "@/server/modules/audit/service";
import { parseTermLabel, sortTermLabels, termLabel } from "@/server/modules/academics/terms";
import type { Actor } from "@/server/policy";
import { SEMESTER_HINT } from "@/lib/semesters";

const INSTITUTION_KEY = "institutionName";

export async function getInstitutionName() {
  const s = await prisma.setting.findUnique({ where: { key: INSTITUTION_KEY } });
  return s?.value ?? "Examinations Department";
}

// The current semester is the Term flagged isCurrent ("" when none is).
export async function getCurrentSemester() {
  const t = await prisma.term.findFirst({ where: { isCurrent: true } });
  return t ? termLabel(t) : "";
}

// Semesters that have at least one exam, newest first.
export async function listSemesters(): Promise<string[]> {
  const terms = await prisma.term.findMany({ where: { exams: { some: {} } } });
  return sortTermLabels(terms.map(termLabel));
}

export async function updateSettings(actor: Actor, input: { currentSemester: string; institutionName: string }) {
  const term = parseTermLabel(input.currentSemester);
  if (!term) throw new HttpError(400, `Current semester must be ${SEMESTER_HINT.toLowerCase()}`);
  return withTx(async (tx) => {
    // Clear first: a partial unique index allows only one current term.
    await tx.term.updateMany({ where: { isCurrent: true, NOT: { season: term.season, year: term.year } }, data: { isCurrent: false } });
    await tx.term.upsert({ where: { season_year: term }, update: { isCurrent: true }, create: { ...term, isCurrent: true } });
    const institutionName = input.institutionName.trim();
    await tx.setting.upsert({ where: { key: INSTITUTION_KEY }, update: { value: institutionName }, create: { key: INSTITUTION_KEY, value: institutionName } });
    await writeAudit(tx, { actor, action: "SETTINGS_UPDATED", details: input });
  });
}
