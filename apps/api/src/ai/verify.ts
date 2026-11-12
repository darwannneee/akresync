import type { DocCheck } from '@akreditasi/shared';
import { friendlyAiError, type AiProvider } from './provider.js';

export const VERIFY_PROMPT_VERSION = 'verify-v1';
export const VERIFY_SAMPLE_CHARS = 6000;

export const VERIFY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isValid: { type: 'BOOLEAN' },
    detectedType: { type: 'STRING' },
    reason: { type: 'STRING' },
  },
  required: ['isValid', 'detectedType', 'reason'],
  propertyOrdering: ['isValid', 'detectedType', 'reason'],
} as const;

const LABEL = {
  LED: 'Laporan Evaluasi Diri (LED) program studi untuk akreditasi (memuat uraian visi-misi, kriteria, analisis dan evaluasi diri)',
  LKPS: 'Laporan Kinerja Program Studi (LKPS) untuk akreditasi (berkas tabel data kuantitatif: mahasiswa, dosen, penelitian, pengabdian, luaran, dll.)',
} as const;

export function buildVerifyPrompt(docType: 'LED' | 'LKPS', sample: string): string {
  return `Anda memeriksa berkas yang diunggah sebagai dokumen akreditasi program studi. Jenis yang dinyatakan pengunggah: ${LABEL[docType]}.
Berdasarkan cuplikan awal berkas di bawah, tentukan apakah berkas tersebut benar-benar jenis tersebut.
Jawab dalam JSON: isValid (true bila sesuai), detectedType (jenis berkas menurut Anda, singkat), reason (alasan satu kalimat, bahasa Indonesia baku).
Bersikaplah toleran terhadap format dan kelengkapan; nyatakan tidak sesuai hanya bila jelas bukan jenis tersebut (misalnya dokumen lain, surat, atau berkas tidak relevan).

CUPLIKAN BERKAS
${sample.slice(0, VERIFY_SAMPLE_CHARS)}`;
}

export type VerifyOutcome =
  | { kind: 'verified'; check: DocCheck }
  | { kind: 'invalid'; check: DocCheck }
  | { kind: 'pending'; check: DocCheck };

const now = () => new Date().toISOString();

export const pendingCheck = (reason: string, model: string | null = null): DocCheck => ({
  status: 'pending', isValid: null, detectedType: null, reason, model, modelVersion: null, inputTokens: null, outputTokens: null, latencyMs: null, at: now(),
});

/** Verifikasi jenis dokumen lewat model. Galat layanan → 'pending' (tidak memblokir pengguna). */
export async function verifyDocType(provider: AiProvider, docType: 'LED' | 'LKPS', sample: string, opts: { attempts?: number; timeoutMs?: number } = {}): Promise<VerifyOutcome> {
  if (sample.trim().length < 20) return { kind: 'pending', check: pendingCheck('Isi berkas tidak dapat diekstrak untuk diverifikasi', provider.model) };
  try {
    const r = await provider.generateJson(buildVerifyPrompt(docType, sample), VERIFY_SCHEMA, { attempts: opts.attempts ?? 1, timeoutMs: opts.timeoutMs ?? 12_000, thinkingLevel: 'LOW' });
    const j = (r.json ?? {}) as Record<string, unknown>;
    if (typeof j.isValid !== 'boolean') return { kind: 'pending', check: pendingCheck('Keluaran verifikasi tidak dapat dipakai', r.usedModel) };
    const check: DocCheck = {
      status: j.isValid ? 'verified' : 'mismatch',
      isValid: j.isValid,
      detectedType: typeof j.detectedType === 'string' ? j.detectedType.slice(0, 200) : null,
      reason: typeof j.reason === 'string' ? j.reason.slice(0, 500) : null,
      model: r.usedModel,
      modelVersion: r.modelVersion,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      latencyMs: r.latencyMs,
      at: now(),
    };
    return { kind: j.isValid ? 'verified' : 'invalid', check };
  } catch (err) {
    return { kind: 'pending', check: pendingCheck(friendlyAiError(err), provider.model) };
  }
}
