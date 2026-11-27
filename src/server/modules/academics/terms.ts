import type { Prisma, Season } from "@prisma/client";
import type { Tx } from "@/server/core/db";
import { compareSemesters, SEMESTER_RE } from "@/lib/semesters";

// The API speaks in semester labels ("Fall 2026"); the database stores Term(season, year).

const SEASON_LABEL: Record<Season, string> = { SPRING: "Spring", SUMMER: "Summer", FALL: "Fall", WINTER: "Winter" };

export const termLabel = (t: { season: Season; year: number }) => `${SEASON_LABEL[t.season]} ${t.year}`;

export function parseTermLabel(label: string): { season: Season; year: number } | null {
  const clean = label.trim().replace(/\s+/g, " ");
  if (!SEMESTER_RE.test(clean)) return null;
  const [season, year] = clean.split(" ");
  return { season: season.toUpperCase() as Season, year: Number(year) };
}

// Filter by an optional semester label. An unknown label matches nothing.
export function termWhere(label?: string): Prisma.TermWhereInput | undefined {
  if (!label) return undefined;
  const t = parseTermLabel(label);
  return t ? { season: t.season, year: t.year } : { id: { in: [] } };
}

export async function ensureTerm(tx: Tx, label: string) {
  const t = parseTermLabel(label);
  if (!t) throw new Error(`Invalid semester label: ${label}`);
  return tx.term.upsert({ where: { season_year: t }, update: {}, create: t });
}

export const sortTermLabels = (labels: string[]) => Array.from(new Set(labels)).sort(compareSemesters);
