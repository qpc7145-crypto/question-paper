import { prisma } from "@/server/core/db";
import { extOf, fileResponse } from "@/server/infra/storage";

// Streams a paper's uploaded file. The caller chooses the download name, because the
// original file name can identify who prepared the paper (FR-14).
export async function paperFileResponse(
  fileId: string,
  name: (ext: string, originalName: string) => string,
  inline: (mimeType: string) => boolean,
) {
  const f = await prisma.storedFile.findUniqueOrThrow({ where: { id: fileId } });
  return fileResponse(f, name(extOf(f.originalName), f.originalName), inline(f.mimeType));
}
