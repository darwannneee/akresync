import type {
  AiProgress, AiScoreSummary, DocCheck, IndexStatus,
  AkStatus, AlScheduleStatus, AppRole, AuditEventKind, AuditStatus, DocumentType, RecordType, SubmissionStage,
} from '@akreditasi/shared';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  institutionId?: string | null;
  institutionName?: string | null;
}

export interface Institution { id: string; name: string; pddiktiCode?: string | null }
export interface Program { id: string; name: string; level: string }
export interface Assessor { id: string; fullName: string; email?: string }

export interface SubmissionSummary {
  id: string;
  institutionId?: string;
  institutionName?: string;
  programId?: string;
  programName?: string;
  programLevel?: string;
  stage: SubmissionStage;
  akStatus: AkStatus;
  alScheduleStatus: AlScheduleStatus;
  documentSetVersion: number;
  chainStage?: string | null;
  createdAt?: string;
  updatedAt?: string;
  aiScore?: AiScoreSummary | null;
  /** Status terbaru peristiwa audit yang menjadi prasyarat tahap berikutnya (hanya pada daftar). */
  gateAudit?: { kind: string; status: AuditStatus; attempts?: number }[];
  auditPending?: number;
  auditFailed?: number;
}

export interface DocumentView {
  id: string;
  setVersion: number;
  docType: DocumentType;
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
  sha256Plain: string;
  cid: string;
  createdAt?: string;
  auditStatus?: AuditStatus | null;
  auditTxId?: string | null;
  indexStatus?: IndexStatus | null;
  indexError?: string | null;
  docCheck?: DocCheck | null;
  auditAttempts?: number | null;
}

export interface PaymentView {
  id: string;
  invoiceNo: string;
  amount: number | string;
  status: 'issued' | 'proof_uploaded' | 'verified' | 'rejected';
  notes?: string | null;
  proofDocumentId?: string | null;
  issuedAt?: string;
}

export interface OfferView {
  id: string;
  offerNo: number;
  status: 'offered' | 'effective' | 'rejected' | 'replaced';
  assessor1Id: string;
  assessor2Id: string;
  leadAssessorId: string;
  assessor1Name?: string;
  assessor2Name?: string;
  leadAssessorName?: string;
  assessor1Response?: 'ACCEPT' | 'REJECT' | null;
  assessor2Response?: 'ACCEPT' | 'REJECT' | null;
  uppsResponse?: 'ACCEPT' | 'REJECT' | null;
  rejectionReason?: string | null;
  rejectionBy?: 'upps' | 'asesor' | null;
  rejectionReviewNotes?: string | null;
  rejectionReviewedAt?: string | null;
  consistencyStatus?: 'pending' | 'approved' | 'returned';
  consistencyNotes?: string | null;
  consistencyAt?: string | null;
}

export interface AssessmentView {
  id: string;
  offerId?: string;
  assessorId: string;
  assessorName?: string;
  phase: 'AK' | 'AL';
  status: 'draft' | 'submitted';
  scores?: Record<string, Record<string, number>>;
  /** Draf penilaian ulang (hanya milik asesor sendiri); skor resmi tetap di `scores`. */
  draftScores?: Record<string, Record<string, number>> | null;
  totalScore?: number | string | null;
  minutesDocumentId?: string | null;
  submittedAt?: string | null;
}

export interface AlScheduleView {
  id: string;
  version: number;
  startDate: string;
  endDate: string;
  location: string;
  mode: 'luring' | 'daring' | 'hibrida';
  status: 'proposed' | 'approved' | 'rejected';
  notes?: string | null;
}

export interface ResponseView {
  id: string;
  responderRole: 'upps' | 'lead_assessor';
  responseType: 'accept' | 'objection' | 'resolution';
  body: string;
  createdAt?: string;
}

export interface CertificateView { id: string; certificateNo: string; issuedAt?: string; decisionRecordId?: string }

export interface FormalRecordView {
  id: string;
  recordType: RecordType;
  recordKey: string;
  seq?: number;
  version: number;
  txId?: string | null;
  blockNumber?: number | string | null;
  status?: 'pending_chain' | 'committed' | 'failed';
  actorRole?: AppRole | string;
  actorUserId?: string | null;
  actorUid?: string | null;
  payload: Record<string, unknown>;
  correction?: { reason: string; evidenceRef: string } | null;
  /** Isi teks catatan (catatan verifikasi, alasan); tidak dikirim ke peran yang tidak berhak. */
  offChain?: { notes?: string | null; reason?: string | null; responseReason?: string | null; offerId?: string } | null;
  committedAt?: string | null;
  createdAt?: string;
  timestamp?: string;
}

export interface AuditEventView {
  eventId: string;
  kind: AuditEventKind | string;
  aggregateType?: string;
  aggregateId?: string;
  version?: number;
  status: AuditStatus | 'saved';
  txId?: string | null;
  blockNumber?: number | string | null;
  payloadSha256?: string;
  actorRole?: string;
  occurredAt?: string;
  attempts?: number;
  lastError?: string | null;
}

export interface SubmissionDetail extends SubmissionSummary {
  documents?: DocumentView[];
  payments?: PaymentView[];
  offers?: OfferView[];
  assessments?: AssessmentView[];
  alSchedules?: AlScheduleView[];
  responses?: ResponseView[];
  certificate?: CertificateView | null;
  records?: FormalRecordView[];
  rejectedAttempts?: { id: string; recordType: RecordType; version: number; error?: string | null; createdAt?: string }[];
  audit?: AuditEventView[];
  aiProgress?: AiProgress;
  /** Catatan verifikasi kelengkapan versi terbaru; dikirim juga ke UPPS pemilik. */
  adminVerification?: { result: 'APPROVED' | 'REVISION_REQUIRED' | 'REJECTED'; notes: string | null; version: number; recordedAt?: string | null } | null;
  /** Catatan verifikasi akhir KEA; untuk Majelis dan pihak internal. */
  finalVerification?: { notes: string | null; version: number; recordedAt?: string | null } | null;
}

export interface RecordHistoryItem {
  txId: string;
  timestamp: string;
  isDelete?: boolean;
  value: {
    version: number;
    payload: Record<string, unknown>;
    lastWriter?: { role?: string; uid?: string };
    correction?: { reason: string; evidenceRef: string } | null;
    prevTxId?: string | null;
  } | null;
}

export interface AuditVerifyResult {
  match: boolean;
  eventId?: string;
  recomputedSha256?: string;
  ledgerSha256?: string | null;
  txId?: string | null;
  message?: string;
}
