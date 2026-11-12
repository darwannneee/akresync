/** Definisi instrumen penilaian (browser-safe, tanpa dependensi Node). */
export type CriterionCode = 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | 'K6' | 'K7' | 'K8';

export interface InstrumentCriterion {
  code: CriterionCode;
  title: string;
  /** true bila butir kriteria ini ikut dihitung dalam skor total. */
  scored: boolean;
  /** Catatan asal/ketidakpastian penentuan kriteria. */
  note?: string;
}

export interface ScoreDescriptor {
  level: number;
  label: string;
}

export interface InstrumentItem {
  /** Kunci butir pada objek skor: nomor pedoman ("12"), atau "4.1", "4.2" bila satu nomor memuat beberapa indikator berbobot. */
  id: string;
  /** NO. pada pedoman. */
  no: number;
  /** Urutan indikator dalam nomor tersebut (1-based) bila nomor memuat lebih dari satu indikator; selain itu null. */
  sub: number | null;
  criterion: CriterionCode;
  element: string;
  indicator: string;
  /** Bobot butir sesuai Lampiran "Bobot Penilaian Akreditasi Program Studi". */
  weight: number;
  /**
   * Deskriptor tiap tingkat skor. Pedoman ini TIDAK memuat deskriptor per tingkat
   * (kolom DESKRIPSI pada form adalah uraian bebas asesor), sehingga null.
   */
  descriptors: ScoreDescriptor[] | null;
  /** Sumber data yang disebut pedoman (form: "Data dan informasi LED dan LKPS"). Nama tabel LKPS tidak disebut. */
  dataSource: string;
  /** Indikator bersifat angka terukur (persentase, jumlah, rerata, IPK, dll.) berdasarkan bunyi indikator. */
  quantitative: boolean;
  /** Rumus perhitungan. Pedoman tidak menyatakan rumus, kecuali definisi pada butir 41. */
  formula: string | null;
  note?: string;
}

export interface Instrument {
  id: string;
  version: string;
  program: string;
  title: string;
  source: { document: string; form: string; weightTable: string };
  criteria: InstrumentCriterion[];
  items: InstrumentItem[];
  scale: { min: number; max: number; allowed: number[]; stated: boolean; note: string };
  total: { rule: string; stated: boolean; maxTotal: number; note: string };
  rankThresholds: null | { rank: string; min: number }[];
  rankNote: string;
  syaratPerlu: null | string[];
  syaratPerluNote: string;
}

/** Skor: kode kriteria -> id butir -> nilai. */
export type InstrumentScores = Record<string, Record<string, number>>;
