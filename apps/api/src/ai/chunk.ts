/** Pemotongan teks menjadi potongan ±800–1200 token dengan overlap. Murni, tanpa I/O. */
export const CHARS_PER_TOKEN = 4;
export const estimateTokens = (s: string): number => Math.max(1, Math.ceil(s.length / CHARS_PER_TOKEN));

export interface ChunkOptions {
  /** Target token per potongan. */
  targetTokens: number;
  overlapTokens: number;
}
// ±500 token perkiraan (~2000 karakter): sesuai batas 512 token model embedding lokal, cukup besar untuk konteks.
export const DEFAULT_CHUNK: ChunkOptions = { targetTokens: 500, overlapTokens: 60 };
export const MIN_PAGE_CHARS = 40;

export interface RawChunk {
  locator: string;
  text: string;
  tokenEstimate: number;
}

export interface PageText {
  page: number;
  text: string;
}

interface Segment {
  page: number;
  text: string;
}

/** Pecah teks panjang pada batas paragraf/kalimat/spasi agar tiap bagian ≤ max karakter. */
export function splitLong(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf('. ', max) + 1;
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.3) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

const normalize = (t: string) => t.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

const pageLocator = (a: number, b: number) => (a === b ? `hlm ${a}` : `hlm ${a}–${b}`);

/** Potong teks per halaman (PDF). Potongan dapat mencakup beberapa halaman; locator = rentang halaman. */
export function chunkPages(pages: PageText[], opts: ChunkOptions = DEFAULT_CHUNK): RawChunk[] {
  const max = opts.targetTokens * CHARS_PER_TOKEN;
  const overlap = opts.overlapTokens * CHARS_PER_TOKEN;
  const segs: Segment[] = [];
  for (const p of pages) {
    const t = normalize(p.text);
    if (t.length < MIN_PAGE_CHARS) continue; // halaman nyaris kosong (nomor halaman, sampul kosong)
    for (const part of splitLong(t, Math.floor(max * 0.6))) segs.push({ page: p.page, text: part });
  }
  const chunks: RawChunk[] = [];
  let cur: Segment[] = [];
  let len = 0;
  let fresh = 0;
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((s) => s.text).join('\n');
    chunks.push({ locator: pageLocator(cur[0]!.page, cur[cur.length - 1]!.page), text, tokenEstimate: estimateTokens(text) });
  };
  for (const s of segs) {
    if (len + s.text.length > max && cur.length) {
      flush();
      fresh = 0;
      // overlap: ambil segmen terakhir selama total ≤ overlap
      const keep: Segment[] = [];
      let l = 0;
      for (let i = cur.length - 1; i >= 0; i--) {
        if (l + cur[i]!.text.length > overlap) break;
        keep.unshift(cur[i]!);
        l += cur[i]!.text.length;
      }
      cur = keep;
      len = l;
    }
    cur.push(s);
    fresh++;
    len += s.text.length + 1;
  }
  if (fresh > 0) flush();
  return chunks;
}

export interface SheetRows {
  sheet: string;
  /** Baris tidak kosong beserta nomor baris aslinya. */
  rows: { row: number; text: string }[];
}

/** Potong tabel XLSX per kelompok baris; tiap potongan diawali nama sheet dan baris kepala (≤ 2 baris pertama). */
export function chunkSheet(s: SheetRows, opts: ChunkOptions = DEFAULT_CHUNK): RawChunk[] {
  const max = opts.targetTokens * CHARS_PER_TOKEN;
  if (!s.rows.length) return [];
  const headerRows = s.rows.slice(0, 2);
  const header = `Sheet "${s.sheet}"\n` + headerRows.map((r) => r.text).join('\n');
  const body = s.rows.slice(headerRows.length);
  const chunks: RawChunk[] = [];
  const emit = (rows: { row: number; text: string }[], withHeader: boolean) => {
    if (!rows.length) return;
    const text = (withHeader ? `${header}\n---\n` : `Sheet "${s.sheet}"\n`) + rows.map((r) => `[b${r.row}] ${r.text}`).join('\n');
    chunks.push({ locator: `sheet ${s.sheet} baris ${rows[0]!.row}–${rows[rows.length - 1]!.row}`, text, tokenEstimate: estimateTokens(text) });
  };
  if (!body.length) {
    const text = header;
    chunks.push({ locator: `sheet ${s.sheet} baris ${headerRows[0]!.row}–${headerRows[headerRows.length - 1]!.row}`, text, tokenEstimate: estimateTokens(text) });
    return chunks;
  }
  let cur: { row: number; text: string }[] = [];
  let len = header.length;
  for (const r of body) {
    const line = r.text.length > max ? r.text.slice(0, max) : r.text;
    if (len + line.length + 8 > max && cur.length) {
      emit(cur, true);
      cur = [];
      len = header.length;
    }
    cur.push({ row: r.row, text: line });
    len += line.length + 8;
  }
  emit(cur, true);
  return chunks;
}
