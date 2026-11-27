import crypto from "node:crypto";
import { z } from "zod";
import { prisma, withTx } from "@/server/core/db";
import { writeAudit } from "@/server/modules/audit/service";
import { termWhere } from "@/server/modules/academics/terms";
import { EXAM_TYPES } from "@/lib/constants";
import type { ExamType } from "@prisma/client";

const isExamType = (s: string): s is ExamType => (EXAM_TYPES as readonly string[]).includes(s);
import { hashPassword } from "@/server/auth/guard";
import type { HandlerMap } from "./index";

// FR-28: faculty database sync, centre database integration, academic calendar sync.
export const erpHandlers: HandlerMap = {
  // New faculty are created as INACTIVE Paper Setters — the Controller must activate them (FR-1 authority).
  "POST faculty": async ({ body }) => {
    const input = z
      .object({ faculty: z.array(z.object({ email: z.string().email(), name: z.string().min(2).max(120) })).max(5000) })
      .parse(body);
    let created = 0, existing = 0;
    for (const f of input.faculty) {
      const email = f.email.toLowerCase();
      if (await prisma.user.findUnique({ where: { email } })) {
        existing++;
        continue;
      }
      await prisma.user.create({
        data: { email, displayName: f.name, role: "SETTER", isActive: false, passwordHash: await hashPassword(crypto.randomBytes(24).toString("hex")) },
      });
      created++;
    }
    return { created, existing, note: "New accounts are inactive until activated by the Controller" };
  },

  "POST centres": async ({ body }) => {
    const input = z
      .object({
        centres: z.array(z.object({
          code: z.string().min(2).max(20), name: z.string().min(2).max(200), address: z.string().max(500).default(""),
          city: z.string().max(100).default(""), capacity: z.number().int().min(0).default(0), externalRef: z.string().max(100).optional(),
        })).max(2000),
      })
      .parse(body);
    let upserted = 0;
    for (const c of input.centres) {
      const code = c.code.toUpperCase();
      await prisma.centre.upsert({ where: { code }, update: { ...c, code }, create: { ...c, code } });
      upserted++;
    }
    return { upserted };
  },

  // Reschedule exams from the academic calendar. Never moves a paper a centre has already opened.
  "POST calendar": async ({ body }) => {
    const input = z
      .object({ events: z.array(z.object({ code: z.string(), semester: z.string(), examType: z.string(), examDate: z.coerce.date() })).max(5000) })
      .parse(body);
    let updated = 0;
    const skipped: string[] = [];
    for (const e of input.events) {
      const key = `${e.code}/${e.semester}/${e.examType}`;
      if (!isExamType(e.examType)) {
        skipped.push(key);
        continue;
      }
      const examType = e.examType;
      const done = await withTx(async (tx) => {
        const s = await tx.exam.findFirst({
          where: { course: { code: e.code.toUpperCase() }, term: termWhere(e.semester), examType },
          include: { paper: { include: { centres: true } } },
        });
        if (!s || s.submissionDeadline >= e.examDate || s.paper?.centres.some((c) => c.firstAccessAt)) return false;
        await tx.exam.update({ where: { id: s.id }, data: { examDate: e.examDate } });
        if (s.paper) {
          await tx.paperCentre.updateMany({ where: { paperId: s.paper.id, availableFrom: s.examDate }, data: { availableFrom: e.examDate } });
        }
        await writeAudit(tx, { actor: null, action: "SUBJECT_UPDATED", entity: "Subject", entityId: s.id, details: { examDate: e.examDate, via: "erp/calendar" } });
        return true;
      });
      if (done) updated++;
      else skipped.push(key);
    }
    return { updated, skipped };
  },
};
