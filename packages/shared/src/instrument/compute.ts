import { INSTRUMENT_DOKTOR_2025 } from './doktor-2025.js';
import type { CriterionCode, Instrument, InstrumentItem, InstrumentScores } from './types.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ScoreValidation {
  ok: boolean;
  errors: string[];
}

function itemsOf(inst: Instrument): InstrumentItem[] {
  const scored = new Set(inst.criteria.filter((c) => c.scored).map((c) => c.code));
  return inst.items.filter((i) => scored.has(i.criterion));
}

/** Nilai maksimum skor total (semua butir berbobot bernilai skor tertinggi). */
export function maxTotal(inst: Instrument = INSTRUMENT_DOKTOR_2025): number {
  return round2(itemsOf(inst).reduce((a, i) => a + i.weight * inst.scale.max, 0));
}

/** Jumlah butir yang dinilai. */
export function scoredItemCount(inst: Instrument = INSTRUMENT_DOKTOR_2025): number {
  return itemsOf(inst).length;
}

/**
 * Validasi bentuk skor: kriteria dan butir harus dikenal, nilai harus salah satu nilai yang diizinkan.
 * `complete: true` mewajibkan seluruh butir berbobot terisi (untuk penyerahan hasil).
 */
export function validateScores(scores: unknown, opts: { complete?: boolean; instrument?: Instrument } = {}): ScoreValidation {
  const inst = opts.instrument ?? INSTRUMENT_DOKTOR_2025;
  const errors: string[] = [];
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return { ok: false, errors: ['skor harus berupa objek {kriteria: {butir: nilai}}'] };
  const byCrit = new Map<string, Set<string>>();
  for (const i of itemsOf(inst)) (byCrit.get(i.criterion) ?? byCrit.set(i.criterion, new Set()).get(i.criterion)!).add(i.id);
  let count = 0;
  for (const [crit, items] of Object.entries(scores as Record<string, unknown>)) {
    const known = byCrit.get(crit);
    if (!known) { errors.push(`kriteria ${crit} tidak dikenal`); continue; }
    if (!items || typeof items !== 'object' || Array.isArray(items)) { errors.push(`kriteria ${crit} harus berupa objek butir`); continue; }
    for (const [id, v] of Object.entries(items as Record<string, unknown>)) {
      if (!known.has(id)) { errors.push(`butir ${crit}.${id} tidak dikenal`); continue; }
      if (typeof v !== 'number' || !inst.scale.allowed.includes(v)) { errors.push(`nilai butir ${id} harus salah satu dari ${inst.scale.allowed.join(', ')}`); continue; }
      count++;
    }
  }
  if (errors.length === 0 && count === 0) errors.push('skor tidak boleh kosong');
  if (opts.complete && errors.length === 0) {
    const missing = itemsOf(inst).filter((i) => typeof (scores as InstrumentScores)[i.criterion]?.[i.id] !== 'number').map((i) => i.id);
    if (missing.length) errors.push(`${missing.length} butir belum dinilai (${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', ...' : ''})`);
  }
  return { ok: errors.length === 0, errors };
}

/** Skor total = jumlah (skor x bobot); butir yang belum diisi dihitung 0 (total sementara). Tidak melempar galat. */
export function computeTotal(scores: InstrumentScores, instrument: Instrument = INSTRUMENT_DOKTOR_2025): number {
  let sum = 0;
  for (const i of itemsOf(instrument)) {
    const v = scores?.[i.criterion]?.[i.id];
    if (typeof v === 'number' && Number.isFinite(v)) sum += v * i.weight;
  }
  return round2(sum);
}

/** Subtotal per kriteria beserta maksimum dan jumlah butir terisi. */
export function criterionSummary(scores: InstrumentScores, code: CriterionCode, instrument: Instrument = INSTRUMENT_DOKTOR_2025) {
  const its = itemsOf(instrument).filter((i) => i.criterion === code);
  let sum = 0;
  let filled = 0;
  for (const i of its) {
    const v = scores?.[code]?.[i.id];
    if (typeof v === 'number') { sum += v * i.weight; filled++; }
  }
  return { subtotal: round2(sum), max: round2(its.reduce((a, i) => a + i.weight * instrument.scale.max, 0)), filled, count: its.length };
}

/** Peringkat sementara dari ambang pedoman; null karena pedoman tidak memuat ambang. */
export function provisionalRank(total: number, instrument: Instrument = INSTRUMENT_DOKTOR_2025): string | null {
  const t = instrument.rankThresholds;
  if (!t) return null;
  const hit = [...t].sort((a, b) => b.min - a.min).find((x) => total >= x.min);
  return hit ? hit.rank : null;
}

export const MAX_TOTAL_SCORE = maxTotal(INSTRUMENT_DOKTOR_2025);
