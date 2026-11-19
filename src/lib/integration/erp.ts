import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/server";
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
      const s = await prisma.subject.findFirst({
        where: { code: e.code.toUpperCase(), semester: e.semester, examType: e.examType },
        include: { paper: { include: { centres: true } } },
      });
      const key = `${e.code}/${e.semester}/${e.examType}`;
      if (!s || s.submissionDeadline >= e.examDate || s.paper?.centres.some((c) => c.firstAccessAt)) {
        skipped.push(key);
        continue;
      }
      await prisma.subject.update({ where: { id: s.id }, data: { examDate: e.examDate } });
      if (s.paper) {
        await prisma.paperCentre.updateMany({ where: { paperId: s.paper.id, availableFrom: s.examDate }, data: { availableFrom: e.examDate } });
      }
      updated++;
    }
    return { updated, skipped };
  },
};
