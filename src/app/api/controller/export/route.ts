import { route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { buildExport } from "@/server/modules/reports/export";

// GET /api/controller/export?report=audit|setters|centres&format=pdf|xlsx&...filters
export const GET = route(async (req: Request) => {
  const actor = await requireUser("CONTROLLER");
  const { file, contentType, filename } = await buildExport(actor, new URL(req.url).searchParams);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});

export const dynamic = "force-dynamic";
