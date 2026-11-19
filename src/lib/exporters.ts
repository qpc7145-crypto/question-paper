import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type Column = { key: string; header: string; width: number };
export type Row = Record<string, string | number | null>;

export async function toXlsx(title: string, columns: Column[], rows: Row[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Question Paper Bank";
  wb.created = new Date();
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  rows.forEach((r) => ws.addRow(r));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Standard PDF fonts only support WinAnsi; replace anything else.
const ascii = (s: string) => s.replace(/[^\x20-\x7E]/g, "?");

export async function toPdf(title: string, subtitle: string, columns: Column[], rows: Row[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 32, size = 7.5, lineH = 10;
  const totalW = columns.reduce((a, c) => a + c.width, 0);
  const scale = (W - 2 * M) / totalW;
  const colW = columns.map((c) => c.width * scale);

  const fit = (text: string, width: number, f = font) => {
    let t = ascii(text);
    if (f.widthOfTextAtSize(t, size) <= width - 4) return t;
    while (t.length > 1 && f.widthOfTextAtSize(t + "...", size) > width - 4) t = t.slice(0, -1);
    return t + "...";
  };

  let page = doc.addPage([W, H]);
  let y = H - M;
  let pageNo = 1;
  const header = () => {
    page.drawText(ascii(title), { x: M, y, size: 14, font: bold, color: rgb(0.06, 0.09, 0.16) });
    y -= 16;
    page.drawText(ascii(subtitle), { x: M, y, size: 8, font, color: rgb(0.28, 0.33, 0.41) });
    y -= 18;
    page.drawRectangle({ x: M, y: y - 3, width: W - 2 * M, height: lineH + 4, color: rgb(0.06, 0.09, 0.16) });
    let x = M;
    columns.forEach((c, i) => {
      page.drawText(fit(c.header, colW[i], bold), { x: x + 2, y, size, font: bold, color: rgb(1, 1, 1) });
      x += colW[i];
    });
    y -= lineH + 6;
  };
  const footer = () =>
    page.drawText(`Page ${pageNo}`, { x: W - M - 40, y: M - 16, size: 7, font, color: rgb(0.4, 0.45, 0.5) });

  header();
  rows.forEach((r, idx) => {
    if (y < M + lineH) {
      footer();
      page = doc.addPage([W, H]);
      pageNo++;
      y = H - M;
      header();
    }
    if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - 3, width: W - 2 * M, height: lineH + 2, color: rgb(0.97, 0.98, 0.99) });
    let x = M;
    columns.forEach((c, i) => {
      page.drawText(fit(String(r[c.key] ?? ""), colW[i]), { x: x + 2, y, size, font, color: rgb(0.06, 0.09, 0.16) });
      x += colW[i];
    });
    y -= lineH + 2;
  });
  footer();
  return Buffer.from(await doc.save());
}
