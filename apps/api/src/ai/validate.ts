import { INSTRUMENT_DOKTOR_2025, type AiItemSuggestion, type AiResult, type Instrument } from '@akreditasi/shared';

export interface DroppedNote {
  butirId?: string;
  reason: 'unknown_butir' | 'score_out_of_range' | 'invalid_citation' | 'no_valid_citation' | 'duplicate_butir' | 'missing_butir' | 'malformed';
  detail?: string;
}

export interface ValidationOutcome {
  result: AiResult;
  dropped: DroppedNote[];
}

const CONF = new Set(['low', 'medium', 'high']);
const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
export const NO_EVIDENCE = 'Bukti tidak ditemukan pada dokumen yang tersedia.';

/**
 * Validasi keluaran model:
 * - butirId di luar instrumen dibuang; duplikat: yang pertama dipakai;
 * - skor di luar skala diperlakukan ditolak → null;
 * - sitasi harus ⊆ potongan yang dikirim (kode pendek → id penuh), sisanya dibuang;
 * - skor tanpa sitasi valid dijadikan null (tidak ada saran tanpa bukti);
 * - butir yang hilang diisi null.
 */
export function validateOutput(raw: unknown, shortToId: Map<string, string>, inst: Instrument = INSTRUMENT_DOKTOR_2025): ValidationOutcome {
  const dropped: DroppedNote[] = [];
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(o.items) ? o.items : [];
  if (!Array.isArray(o.items)) dropped.push({ reason: 'malformed', detail: 'items bukan array' });
  const scoredCrit = new Set(inst.criteria.filter((c) => c.scored).map((c) => c.code));
  const known = new Map(inst.items.filter((i) => scoredCrit.has(i.criterion)).map((i) => [i.id, i]));
  const allowed = new Set(inst.scale.allowed);
  const byId = new Map<string, AiItemSuggestion>();

  for (const r of rawItems) {
    const it = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const id = typeof it.butirId === 'string' ? it.butirId.trim() : typeof it.butirId === 'number' ? String(it.butirId) : '';
    const meta = known.get(id);
    if (!meta) {
      dropped.push({ butirId: id || undefined, reason: 'unknown_butir' });
      continue;
    }
    if (byId.has(id)) {
      dropped.push({ butirId: id, reason: 'duplicate_butir' });
      continue;
    }
    let score: number | null = null;
    if (it.suggestedScore !== null && it.suggestedScore !== undefined) {
      if (typeof it.suggestedScore === 'number' && allowed.has(it.suggestedScore)) score = it.suggestedScore;
      else dropped.push({ butirId: id, reason: 'score_out_of_range', detail: String(it.suggestedScore) });
    }
    const cites: string[] = [];
    for (const c of Array.isArray(it.citations) ? it.citations : []) {
      const key = typeof c === 'string' ? c.trim().replace(/^\[|\]$/g, '') : '';
      const full = shortToId.get(key) ?? shortToId.get('C' + key);
      if (full && !cites.includes(full)) cites.push(full);
      else if (!full) dropped.push({ butirId: id, reason: 'invalid_citation', detail: String(c).slice(0, 40) });
    }
    if (score !== null && cites.length === 0) {
      dropped.push({ butirId: id, reason: 'no_valid_citation' });
      score = null;
    }
    const confidence = typeof it.confidence === 'string' && CONF.has(it.confidence) ? (it.confidence as AiItemSuggestion['confidence']) : 'low';
    let justification = clip(it.justification, 1200);
    if (score === null && !justification) justification = NO_EVIDENCE;
    byId.set(id, { butirId: id, criterion: meta.criterion, suggestedScore: score, confidence: score === null ? 'low' : confidence, justification, citations: cites });
  }

  const items: AiItemSuggestion[] = [];
  for (const [id, meta] of known) {
    const got = byId.get(id);
    if (got) items.push(got);
    else {
      dropped.push({ butirId: id, reason: 'missing_butir' });
      items.push({ butirId: id, criterion: meta.criterion, suggestedScore: null, confidence: 'low', justification: NO_EVIDENCE, citations: [] });
    }
  }
  return { result: { items, summary: clip(o.summary, 2500) }, dropped };
}
