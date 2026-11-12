/** Tipe hasil modul AI pendukung keputusan (off-chain + audit AIAnalysisSaved). */
export const AI_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export type AiStatus = (typeof AI_STATUSES)[number];

export const INDEX_STATUSES = ['pending', 'indexing', 'indexed', 'failed', 'skipped'] as const;
export type IndexStatus = (typeof INDEX_STATUSES)[number];

export type AiConfidence = 'low' | 'medium' | 'high';

export interface AiCitation {
  chunkId: string;
  documentId: string;
  docType: 'LED' | 'LKPS';
  locator: string;
  textSha256: string;
  /** Kutipan potongan sumber (hanya pada detail). */
  excerpt?: string;
}

export interface AiItemSuggestion {
  butirId: string;
  criterion: string;
  suggestedScore: number | null;
  confidence: AiConfidence;
  justification: string;
  citations: string[];
}

export interface AiResult {
  items: AiItemSuggestion[];
  summary: string;
}

export interface AiFallbackAttempt {
  model: string;
  code: string;
  at: string;
}

export interface AiRetrievedRef {
  chunkId: string;
  documentId: string;
  locator: string;
  textSha256: string;
  score: number;
  docType?: 'LED' | 'LKPS';
  /** Salinan awal teks potongan (≤ 1500 karakter) agar sitasi tetap terbaca setelah indeks ulang. */
  excerpt?: string;
}

export interface AiAnalysisDto {
  id: string;
  submissionId: string;
  phase: 'AK' | 'AL';
  status: AiStatus;
  attempts: number;
  error: string | null;
  requestedBy: string | null;
  requestedByName?: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  nextAttemptAt: string | null;
  setVersion: number | null;
  /** Rincian teknis. */
  requestedModel: string | null;
  usedModel: string | null;
  modelVersion: string | null;
  fallbacks: AiFallbackAttempt[];
  promptVersion: string | null;
  promptTemplateSha256: string | null;
  thinkingLevel: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  resultSha256: string | null;
  embeddingModel: string | null;
  retrievedCount: number;
  droppedCitations: number;
  result: AiResult | null;
  /** Hanya pada detail. */
  citations?: AiCitation[];
  trigger: 'auto' | 'manual';
  totals?: AiTotals | null;
  comparisons?: AiComparison[];
  auditStatus?: string | null;
  auditTxId?: string | null;
}

export type AiComparisonKind = 'same' | 'different' | 'no_suggestion' | 'no_final';

export interface AiComparisonItem {
  butirId: string;
  suggested: number | null;
  final: number | null;
  kind: AiComparisonKind;
}

export interface AiComparison {
  analysisId: string;
  assessorId: string;
  assessorName: string | null;
  phase: 'AK' | 'AL';
  finalStatus: 'draft' | 'submitted' | null;
  items: AiComparisonItem[];
  summary: { same: number; different: number; noSuggestion: number; noFinal: number; total: number };
}

export interface DocumentIndexInfo {
  documentId: string;
  docType: string;
  fileName: string;
  indexStatus: IndexStatus;
  indexError: string | null;
  chunkCount: number;
  indexedAt: string | null;
  embeddingDim: number | null;
  embedModel: string | null;
  embedded: number | null;
  total: number | null;
  check: DocCheck | null;
}

export interface AiAnalysisList {
  latest: AiAnalysisDto | null;
  analyses: AiAnalysisDto[];
  index: DocumentIndexInfo[];
  comparisons: AiComparison[];
  enabled: boolean;
}

/** Verifikasi jenis dokumen oleh model: verified = sesuai; pending = verifikasi tertunda (layanan sibuk/tidak dapat diekstrak); mismatch = terdeteksi tidak sesuai saat verifikasi ulang. */
export type DocCheckStatus = 'verified' | 'pending' | 'mismatch';
export interface DocCheck {
  status: DocCheckStatus;
  isValid: boolean | null;
  detectedType: string | null;
  reason: string | null;
  model: string | null;
  modelVersion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  at: string;
}

export interface AiCriterionTotal {
  code: string;
  subtotal: number;
  max: number;
  filled: number;
  count: number;
}
export interface AiTotals {
  total: number;
  max: number;
  answered: number;
  itemCount: number;
  perCriterion: AiCriterionTotal[];
}
/** Ringkasan skor AI sementara untuk daftar/dasbor. Bukan nilai resmi. */
export interface AiScoreSummary {
  analysisId: string;
  setVersion: number | null;
  finishedAt: string | null;
  totals: AiTotals;
}

/** Progres AI yang aman ditampilkan kepada UPPS (tanpa skor/justifikasi). */
export interface AiProgress {
  enabled: boolean;
  setVersion: number;
  documents: {
    documentId: string;
    docType: string;
    fileName: string;
    checked: boolean;
    check: DocCheck | null;
    indexStatus: IndexStatus;
    /** Kemajuan penyematan (potongan bersemat / total). */
    embedded: number | null;
    total: number | null;
  }[];
  analysis: { status: AiStatus; attempts: number; finishedAt: string | null } | null;
  /** Ringkasan tahap untuk satu kalimat di UI. */
  phase: 'waiting_documents' | 'checking' | 'indexing' | 'analyzing' | 'done' | 'failed';
}
