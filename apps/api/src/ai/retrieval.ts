import { INSTRUMENT_DOKTOR_2025, type Instrument } from '@akreditasi/shared';

export interface Candidate {
  id: string;
  documentId: string;
  docType: 'LED' | 'LKPS';
  chunkIndex: number;
  locator: string;
  text: string;
  textSha256: string;
  tokenEstimate: number;
  score: number;
}

export interface RetrievalQuery {
  key: string;
  criterion: string;
  text: string;
  k: number;
}

/** Kueri retrieval: satu per kriteria (judul + semua indikator) dan satu per butir (elemen + indikator). */
export function buildQueries(inst: Instrument = INSTRUMENT_DOKTOR_2025, perCriterionK = 6, perItemK = 2): RetrievalQuery[] {
  const out: RetrievalQuery[] = [];
  for (const c of inst.criteria.filter((x) => x.scored)) {
    const items = inst.items.filter((i) => i.criterion === c.code);
    out.push({ key: `crit:${c.code}`, criterion: c.code, k: perCriterionK, text: `${c.title}. ${items.map((i) => i.indicator).join(' ')}`.slice(0, 3000) });
    for (const i of items) out.push({ key: `item:${i.id}`, criterion: c.code, k: perItemK, text: `${c.title}. ${i.element}: ${i.indicator}`.slice(0, 1500) });
  }
  return out;
}

/**
 * Gabung hasil retrieval beberapa kueri: deduplikasi per id (skor tertinggi dipakai), urut skor menurun,
 * ambil sampai anggaran token habis, lalu urutkan kembali menurut dokumen & posisi agar konteks runtut.
 */
export function assembleContext(results: Candidate[][], maxTokens: number): { chosen: Candidate[]; truncated: boolean } {
  const best = new Map<string, Candidate>();
  for (const list of results) {
    for (const c of list) {
      const cur = best.get(c.id);
      if (!cur || c.score > cur.score) best.set(c.id, c);
    }
  }
  const ranked = [...best.values()].sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex);
  const chosen: Candidate[] = [];
  let used = 0;
  let truncated = false;
  for (const c of ranked) {
    if (used + c.tokenEstimate > maxTokens) {
      truncated = true;
      continue;
    }
    chosen.push(c);
    used += c.tokenEstimate;
  }
  chosen.sort((a, b) => (a.docType === b.docType ? (a.documentId === b.documentId ? a.chunkIndex - b.chunkIndex : a.documentId.localeCompare(b.documentId)) : a.docType === 'LED' ? -1 : 1));
  return { chosen, truncated };
}

const STOP = new Set(['dan', 'yang', 'di', 'ke', 'dari', 'untuk', 'dengan', 'pada', 'dalam', 'atau', 'serta', 'oleh', 'the', 'of', 'a', 'itu', 'ini', 'adalah']);
const tokenize = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w));

/** Retrieval kata kunci (cadangan tanpa embedding): skor = irisan istilah kueri, dibobot IDF sederhana. */
export function keywordRank<T extends { id: string; text: string }>(chunks: T[], query: string, k: number): (T & { score: number })[] {
  const q = new Set(tokenize(query));
  if (!q.size) return [];
  const docs = chunks.map((c) => ({ c, terms: new Set(tokenize(c.text)) }));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.terms) if (q.has(t)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  return docs
    .map(({ c, terms }) => {
      let s = 0;
      for (const t of q) if (terms.has(t)) s += Math.log(1 + n / (df.get(t) ?? 1));
      return { ...c, score: s / q.size };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
