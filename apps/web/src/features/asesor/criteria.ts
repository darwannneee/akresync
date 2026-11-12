/** Daftar kriteria asesmen yang dapat dikonfigurasi. Tiap butir bernilai 0–4; total dinormalisasi ke skala 0–400. */
export interface Criterion { code: string; name: string; items: number }
export const CRITERIA: Criterion[] = [
  { code: 'C1', name: 'Visi, misi, tujuan, dan strategi', items: 4 },
  { code: 'C2', name: 'Tata pamong, tata kelola, dan kerja sama', items: 5 },
  { code: 'C3', name: 'Mahasiswa', items: 5 },
  { code: 'C4', name: 'Sumber daya manusia', items: 5 },
  { code: 'C5', name: 'Keuangan, sarana, dan prasarana', items: 4 },
  { code: 'C6', name: 'Pendidikan', items: 6 },
  { code: 'C7', name: 'Penelitian', items: 4 },
  { code: 'C8', name: 'Pengabdian kepada masyarakat', items: 4 },
  { code: 'C9', name: 'Luaran dan capaian tridharma', items: 5 },
];
export const MAX_ITEM = 4;
export const MAX_TOTAL = 400;
export type Scores = Record<string, Record<string, number | ''>>;

export function emptyScores(): Scores {
  const o: Scores = {};
  for (const c of CRITERIA) { o[c.code] = {}; for (let i = 1; i <= c.items; i++) o[c.code]![`b${i}`] = ''; }
  return o;
}
export function computeTotal(s: Scores): { total: number; filled: number; count: number } {
  let sum = 0, filled = 0, count = 0;
  for (const c of CRITERIA) for (let i = 1; i <= c.items; i++) {
    count++;
    const v = s[c.code]?.[`b${i}`];
    if (typeof v === 'number') { sum += v; filled++; }
  }
  return { total: count ? Math.round(((sum / (count * MAX_ITEM)) * MAX_TOTAL) * 100) / 100 : 0, filled, count };
}
