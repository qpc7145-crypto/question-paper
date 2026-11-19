
type Renderable = {
  format: string;
  mode: string;
  contentHtml: string;
  sectionAHtml: string;
  sectionBHtml: string;
  sectionCHtml: string;
  instructions: string;
  totalMarks: number | null;
  durationMinutes: number | null;
  subject: { code: string; title: string; semester: string; examType: string; examDate: Date };
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Produces a standalone, printable HTML question paper. Content HTML was sanitised on save.
// Contains no setter or typist identity (FR-14). `watermark` traces a centre's copy.
export function renderPaperDocument(p: Renderable, opts: { institution: string; watermark?: string; banner?: string }) {
  const body =
    p.mode === "STRUCTURED"
      ? [
          ["Section A", p.sectionAHtml],
          ["Section B", p.sectionBHtml],
          ["Section C", p.sectionCHtml],
        ]
          .filter(([, html]) => html.replace(/<[^>]*>/g, "").trim())
          .map(([t, html]) => `<section><h2>${t}</h2>${html}</section>`)
          .join("")
      : p.contentHtml;

  const meta = [
    p.durationMinutes ? `Time allowed: ${p.durationMinutes} minutes` : "",
    p.totalMarks ? `Maximum marks: ${p.totalMarks}` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.subject.code)} — ${esc(p.subject.examType)} ${esc(p.subject.semester)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: "Times New Roman", Georgia, serif; color: #0F172A; background: #F8FAFC; margin: 0; }
  .sheet { background: #fff; max-width: 800px; margin: 24px auto; padding: 48px 56px; border: 1px solid #E2E8F0; position: relative; }
  header { text-align: center; border-bottom: 2px solid #0F172A; padding-bottom: 12px; margin-bottom: 16px; }
  header h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: .02em; }
  header .sub { font-size: 15px; margin: 2px 0; }
  .meta { text-align: center; font-size: 13px; color: #475569; margin: 8px 0 16px; }
  .instructions { border: 1px solid #CBD5E1; padding: 10px 14px; font-size: 14px; margin-bottom: 20px; white-space: pre-wrap; }
  section h2 { font-size: 16px; text-transform: uppercase; border-bottom: 1px solid #CBD5E1; padding-bottom: 4px; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #94A3B8; padding: 4px 8px; }
  .wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none;
        font: 700 28px/1.3 system-ui, sans-serif; color: rgba(15,23,42,.06); transform: rotate(-30deg); text-align: center; z-index: 0; }
  .banner { font: 500 13px system-ui, sans-serif; background: #FEF3C7; color: #92400E; padding: 8px 12px; text-align: center; }
  .toolbar { text-align: center; margin: 16px 0 0; font-family: system-ui, sans-serif; }
  .toolbar button { background: #1D4ED8; color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; font-weight: 500; cursor: pointer; }
  .content { position: relative; z-index: 1; font-size: 15px; line-height: 1.55; }
  @media print { body { background: #fff; } .sheet { border: 0; margin: 0; max-width: none; padding: 0; } .toolbar, .banner { display: none; } }
</style></head>
<body>
${opts.banner ? `<div class="banner">${esc(opts.banner)}</div>` : ""}
<div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
${opts.watermark ? `<div class="wm">${esc(opts.watermark)}</div>` : ""}
<div class="sheet">
  <header>
    <h1>${esc(opts.institution)}</h1>
    <p class="sub"><strong>${esc(p.subject.code)}</strong> — ${esc(p.subject.title)}</p>
    <p class="sub">${esc(p.subject.examType)} Examination · ${esc(p.subject.semester)}</p>
  </header>
  ${meta ? `<div class="meta">${meta}</div>` : ""}
  ${p.instructions.trim() ? `<div class="instructions"><strong>Instructions:</strong>\n${esc(p.instructions)}</div>` : ""}
  <div class="content">${body}</div>
</div>
</body></html>`;
}

export function htmlResponse(html: string, filename: string, attachment: boolean) {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `${attachment ? "attachment" : "inline"}; filename="${filename.replace(/[^\w.\-]+/g, "_")}"`,
      "Cache-Control": "no-store, private",
      // Paper documents run no scripts except the inline print button.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:",
    },
  });
}
