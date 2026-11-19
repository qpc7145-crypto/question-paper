import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http";

// Secure file repository: files live outside /public under random keys and are only
// ever returned through access-checked API routes (no direct URLs).
const ROOT = path.resolve(process.env.STORAGE_DIR || "./storage");
const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024;

const TYPES = {
  pdf: { mime: "application/pdf", magic: (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
  doc: {
    mime: "application/msword",
    magic: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  },
} as const;
type Ext = keyof typeof TYPES;

export function extOf(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}

export async function saveUpload(file: File, uploadedById: string) {
  if (!file || typeof file.arrayBuffer !== "function") throw new HttpError(400, "No file uploaded");
  if (file.size === 0) throw new HttpError(400, "File is empty");
  if (file.size > MAX_BYTES) throw new HttpError(413, `File exceeds ${MAX_BYTES / 1024 / 1024} MB limit`);
  const ext = extOf(file.name) as Ext;
  if (!(ext in TYPES)) throw new HttpError(415, "Only PDF, DOC and DOCX files are accepted");
  const buf = Buffer.from(await file.arrayBuffer());
  if (!TYPES[ext].magic(buf)) throw new HttpError(415, "File content does not match its extension");

  await fs.mkdir(ROOT, { recursive: true });
  const storageKey = crypto.randomBytes(24).toString("hex");
  await fs.writeFile(path.join(ROOT, storageKey), buf, { mode: 0o600 });
  return prisma.storedFile.create({
    data: {
      storageKey,
      originalName: file.name.slice(0, 200),
      mimeType: TYPES[ext].mime,
      sizeBytes: buf.length,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      uploadedById,
    },
  });
}

export async function readStored(storageKey: string) {
  if (!/^[a-f0-9]{48}$/.test(storageKey)) throw new HttpError(400, "Invalid file key");
  return fs.readFile(path.join(ROOT, storageKey));
}

// Streams a stored file. `downloadName` lets callers hide the original file name,
// which might reveal the uploader's identity (FR-14).
export async function fileResponse(
  f: { storageKey: string; mimeType: string; originalName: string },
  downloadName?: string,
  inline = false,
) {
  const data = await readStored(f.storageKey);
  const name = (downloadName ?? f.originalName).replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function safeName(base: string, originalName: string) {
  return `${base.replace(/[^\w\-]+/g, "_")}.${extOf(originalName)}`;
}
