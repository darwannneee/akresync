import ExcelJS from 'exceljs';
import { getDocumentProxy, extractText } from 'unpdf';
import { chunkPages, chunkSheet, type RawChunk, type SheetRows } from './chunk.js';

export const MIN_PDF_CHARS = 200;

export async function extractPdfPages(data: Uint8Array): Promise<{ totalPages: number; pages: { page: number; text: string }[] }> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const arr = Array.isArray(text) ? text : [text];
  return { totalPages, pages: arr.map((t, i) => ({ page: i + 1, text: t })) };
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, any>;
    if ('result' in o && o.result !== undefined) return cellText(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((r: any) => r.text).join('');
    if ('text' in o) return cellText(o.text);
    if ('error' in o) return '';
    return '';
  }
  return String(v).replace(/\s+/g, ' ').trim().slice(0, 500);
}

export async function extractSheets(data: Uint8Array | Buffer): Promise<SheetRows[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(data) as any);
  const sheets: SheetRows[] = [];
  wb.eachSheet((ws) => {
    const rows: { row: number; text: string }[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(cellText(cell.value)));
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (cells.some((c) => c)) rows.push({ row: rowNumber, text: cells.join(' | ') });
    });
    if (rows.length) sheets.push({ sheet: ws.name, rows });
  });
  return sheets;
}

export interface ExtractResult {
  chunks: RawChunk[];
  stats: { units: number; chars: number; kind: 'pdf' | 'xlsx' };
}

export async function extractAndChunk(docType: 'LED' | 'LKPS', mime: string, fileName: string, data: Buffer): Promise<ExtractResult> {
  const isXlsx = /spreadsheetml|ms-excel/.test(mime) || /\.xlsx?$/i.test(fileName);
  if (isXlsx) {
    const sheets = await extractSheets(data);
    const chunks = sheets.flatMap((s) => chunkSheet(s, { targetTokens: 500, overlapTokens: 0 }));
    return { chunks, stats: { units: sheets.length, chars: chunks.reduce((a, c) => a + c.text.length, 0), kind: 'xlsx' } };
  }
  if (mime === 'application/pdf' || /\.pdf$/i.test(fileName)) {
    const { totalPages, pages } = await extractPdfPages(data);
    const chars = pages.reduce((a, p) => a + p.text.length, 0);
    if (chars < MIN_PDF_CHARS) throw new Error(`Tidak ada teks yang dapat diekstrak dari PDF (${totalPages} halaman; kemungkinan hasil pindai tanpa OCR)`);
    const chunks = chunkPages(pages);
    return { chunks, stats: { units: totalPages, chars, kind: 'pdf' } };
  }
  throw new Error(`Tipe berkas ${mime} (${docType}) belum didukung untuk pengindeksan; gunakan PDF atau XLSX`);
}

/** Cuplikan awal berkas untuk verifikasi jenis dokumen (±6000 karakter). Null bila tidak dapat diekstrak. */
export async function extractSample(mime: string, fileName: string, data: Buffer, maxChars = 6000): Promise<string | null> {
  try {
    const isXlsx = /spreadsheetml|ms-excel/.test(mime) || /\.xlsx?$/i.test(fileName);
    if (isXlsx) {
      const sheets = await extractSheets(data);
      if (!sheets.length) return null;
      let out = `Daftar sheet: ${sheets.map((s) => s.sheet).join(', ')}\n`;
      for (const s of sheets.slice(0, 6)) {
        out += `\n# Sheet ${s.sheet}\n` + s.rows.slice(0, 8).map((r) => r.text).join('\n') + '\n';
        if (out.length >= maxChars) break;
      }
      return out.slice(0, maxChars);
    }
    if (mime === 'application/pdf' || /\.pdf$/i.test(fileName)) {
      const { pages } = await extractPdfPages(data);
      const text = pages.slice(0, 5).map((p) => p.text).join('\n').replace(/\s+/g, ' ').trim();
      return text.length ? text.slice(0, maxChars) : null;
    }
    return null;
  } catch {
    return null;
  }
}
