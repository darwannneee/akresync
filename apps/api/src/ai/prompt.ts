import { INSTRUMENT_DOKTOR_2025, type Instrument } from '@akreditasi/shared';
import { sha256Hex } from '@akreditasi/shared/node';

/** Naikkan setiap kali PROMPT_TEMPLATE atau skema keluaran berubah. */
export const PROMPT_VERSION = 'ak-rag-v1';

export const PROMPT_TEMPLATE = `Anda adalah asisten analisis untuk asesor akreditasi program studi LAM Teknik. Tugas Anda memberi SARAN skor per butir instrumen berdasarkan bukti pada dokumen Laporan Evaluasi Diri (LED) dan Laporan Kinerja Program Studi (LKPS) yang diajukan. Keputusan skor resmi sepenuhnya ada pada asesor manusia; keluaran Anda hanya pendukung keputusan.

Fase penilaian: {{FASE}}.
Skala skor: bilangan bulat {{SKALA}}.

ATURAN WAJIB
1. Gunakan HANYA informasi pada bagian "POTONGAN DOKUMEN" di bawah. Jangan memakai pengetahuan luar atau menebak.
2. Setiap butir yang diberi skor wajib menyebut sitasi: daftar kode potongan (mis. "C1a2b3c4d") yang menjadi dasarnya. Jangan membuat kode yang tidak ada.
3. Jika bukti pada potongan tidak cukup untuk menilai suatu butir, isi suggestedScore dengan null, confidence "low", dan justifikasi diawali "Bukti tidak ditemukan".
4. Justifikasi paling banyak 3 kalimat, bahasa Indonesia baku, menyebut fakta/angka dari bukti. Jangan menyebut kode butir pada justifikasi.
5. Keluarkan SATU entri untuk SETIAP butir pada daftar instrumen, memakai butirId persis seperti tertulis.
6. Tulis ringkasan umum (summary) paling banyak 5 kalimat: kekuatan utama, kelemahan utama, dan butir yang bukti dokumennya paling kurang.
7. Keluaran harus berupa JSON sesuai skema; tanpa teks lain.

INSTRUMEN PENILAIAN (butirId | elemen | indikator | bobot)
{{INSTRUMEN}}

POTONGAN DOKUMEN (format: [kode] jenis dokumen, lokasi)
{{KONTEKS}}
`;

export const PROMPT_TEMPLATE_SHA256 = sha256Hex(PROMPT_TEMPLATE);

/** Skema keluaran (subset OpenAPI yang diterima Gemini). */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          butirId: { type: 'STRING' },
          suggestedScore: { type: 'NUMBER', nullable: true },
          confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
          justification: { type: 'STRING' },
          citations: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['butirId', 'suggestedScore', 'confidence', 'justification', 'citations'],
        propertyOrdering: ['butirId', 'suggestedScore', 'confidence', 'justification', 'citations'],
      },
    },
    summary: { type: 'STRING' },
  },
  required: ['items', 'summary'],
  propertyOrdering: ['items', 'summary'],
} as const;

export interface PromptChunk {
  shortId: string;
  docType: 'LED' | 'LKPS';
  locator: string;
  text: string;
}

export function instrumentText(inst: Instrument = INSTRUMENT_DOKTOR_2025): string {
  const scored = new Set(inst.criteria.filter((c) => c.scored).map((c) => c.code));
  const lines: string[] = [];
  for (const c of inst.criteria.filter((x) => x.scored)) {
    lines.push(`Kriteria ${c.code}: ${c.title}`);
    for (const i of inst.items.filter((x) => x.criterion === c.code && scored.has(x.criterion))) {
      lines.push(`${i.id} | ${i.element} | ${i.indicator} | ${i.weight}`);
    }
  }
  return lines.join('\n');
}

export function buildPrompt(phase: 'AK' | 'AL', chunks: PromptChunk[], inst: Instrument = INSTRUMENT_DOKTOR_2025): string {
  const faseLabel = phase === 'AK' ? 'Asesmen Kecukupan (AK), berbasis dokumen' : 'Asesmen Lapangan (AL), berbasis dokumen sebagai bahan awal';
  const ctx = chunks.map((c) => `[${c.shortId}] ${c.docType}, ${c.locator}\n${c.text}`).join('\n\n');
  return PROMPT_TEMPLATE.replace('{{FASE}}', faseLabel)
    .replace('{{SKALA}}', inst.scale.allowed.join(', '))
    .replace('{{INSTRUMEN}}', instrumentText(inst))
    .replace('{{KONTEKS}}', ctx || '(tidak ada potongan dokumen yang relevan)');
}

/** Kode pendek potongan: "C" + awalan id; diperpanjang bila terjadi tabrakan. */
export function assignShortIds(ids: string[]): Map<string, string> {
  for (const len of [8, 12, 16, 32]) {
    const m = new Map<string, string>();
    const seen = new Set<string>();
    let ok = true;
    for (const id of ids) {
      const s = 'C' + id.replace(/-/g, '').slice(0, len);
      if (seen.has(s)) {
        ok = false;
        break;
      }
      seen.add(s);
      m.set(id, s);
    }
    if (ok) return m;
  }
  throw new Error('tabrakan kode potongan');
}
