import { NextResponse } from "next/server";
import { DEMO } from "@/lib/demo/flag";

// In the design preview there is no backend for file downloads, previews and exports.
// Paper previews, centre downloads and model papers are sent to /demo/view, which renders
// them in the browser after applying the same access checks as the real routes.
// Everything else explains what would happen.
export async function GET(req: Request) {
  if (!DEMO) return new Response("Not found", { status: 404 });
  const from = req.headers.get("x-demo-from") ?? "";
  if (/^\/api\/(papers\/[^/]+\/preview|centre\/papers\/[^/]+\/download|setter\/model-papers\/[^/?]+)/.test(from)) {
    const url = new URL("/demo/view", req.url);
    url.searchParams.set("src", from);
    return NextResponse.redirect(url);
  }
  const what = from.includes("/export") ? "Report export (PDF / Excel)" : "File download";
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design preview</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F8FAFC;color:#0F172A;font:15px/1.5 system-ui,sans-serif;padding:16px}
.c{max-width:420px;background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:28px}h1{font-size:18px;margin:0 0 8px}p{margin:0 0 16px;color:#475569}a{color:#1D4ED8;font-weight:500}</style></head>
<body><div class="c"><h1>${what} isn't available in the design preview</h1><p>This preview runs without a backend, so files aren't generated or stored. In the full system this button downloads the real document.</p><a href="javascript:history.back()">← Go back</a></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const dynamic = "force-dynamic";
