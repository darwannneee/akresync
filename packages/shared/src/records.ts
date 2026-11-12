import type { FabricRole, MspId } from './roles.js';

/** Jenis catatan formal on-chain (bagian pertama kunci komposit JENIS~idPengajuan~urutan). */
export const RECORD_TYPES = [
  'SUBMISSION',
  'ADMIN_VERIFICATION',
  'ASSESSOR_OFFER',
  'ASSIGNMENT_RESPONSE',
  'ASSESSMENT_RESULT',
  'FINAL_VERIFICATION',
  'DECISION',
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** Catatan yang melekat ke individu: koreksi wajib oleh uid yang sama. */
export const INDIVIDUAL_RECORD_TYPES: readonly RecordType[] = ['ASSIGNMENT_RESPONSE', 'ASSESSMENT_RESULT'];
/** Catatan yang tidak bisa dikoreksi lewat CorrectRecord. */
export const NON_CORRECTABLE_RECORD_TYPES: readonly RecordType[] = ['SUBMISSION', 'ASSESSOR_OFFER'];

export const DOCUMENT_TYPES = ['LED', 'LKPS', 'SUPPORT', 'PAYMENT_PROOF', 'AL_MINUTES', 'CERTIFICATE'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface DocumentRef {
  type: DocumentType;
  cid: string; // CID ciphertext di IPFS
  sha256: string; // hex SHA-256 plaintext
  sizeBytes: number;
}

export interface SubmissionPayload {
  institutionId: string;
  programId: string;
  documentSetVersion: number;
  documents: DocumentRef[]; // minimal LED + LKPS
}

export type AdminVerificationResult = 'APPROVED' | 'REVISION_REQUIRED' | 'REJECTED';
export interface AdminVerificationPayload {
  documentSetVersion: number;
  result: AdminVerificationResult;
  notesSha256: string | null;
}

export interface AssessorOfferPayload {
  offerNo: number;
  assessorUids: [string, string];
  leadUid: string;
  replacesOfferSeq: number | null;
}

export type AssignmentResponseValue = 'ACCEPT' | 'REJECT';
export interface AssignmentResponsePayload {
  offerSeq: number;
  responderRole: 'asesor' | 'upps';
  response: AssignmentResponseValue;
  reasonSha256: string | null;
}

export type AssessmentPhase = 'AK' | 'AL';
export interface AssessmentResultPayload {
  phase: AssessmentPhase;
  offerSeq: number;
  scoreSummarySha256: string; // hash rekap skor rinci (off-chain)
  totalScore: number; // 0..400
  minutesCid: string | null; // wajib untuk AL
  minutesSha256: string | null; // wajib untuk AL
  documentSetVersion: number;
}

export interface FinalVerificationPayload {
  alRecordKey: string;
  akRecordKeys: [string, string];
  notesSha256: string | null;
}

export const ACCREDITATION_RANKS = ['UNGGUL', 'BAIK_SEKALI', 'BAIK', 'TIDAK_TERAKREDITASI'] as const;
export type AccreditationRank = (typeof ACCREDITATION_RANKS)[number];
export interface DecisionPayload {
  rank: AccreditationRank;
  totalScore: number;
  decreeNumber: string;
  validFrom: string | null; // YYYY-MM-DD, null jika TIDAK_TERAKREDITASI
  validUntil: string | null;
  finalVerificationKey: string;
}

export interface RecordPayloadMap {
  SUBMISSION: SubmissionPayload;
  ADMIN_VERIFICATION: AdminVerificationPayload;
  ASSESSOR_OFFER: AssessorOfferPayload;
  ASSIGNMENT_RESPONSE: AssignmentResponsePayload;
  ASSESSMENT_RESULT: AssessmentResultPayload;
  FINAL_VERIFICATION: FinalVerificationPayload;
  DECISION: DecisionPayload;
}

export interface RecordActor {
  mspId: MspId;
  role: FabricRole;
  uid: string;
}

export interface CorrectionInfo {
  reason: string;
  evidenceRef: string;
}

/** Nilai satu catatan formal di world state. */
export interface FormalRecord<T extends RecordType = RecordType> {
  docType: 'formalRecord';
  recordKey: string;
  recordType: T;
  submissionId: string;
  seq: number;
  version: number; // 1 = asli, >1 = hasil koreksi
  actor: RecordActor; // pencatat awal (tidak berubah saat koreksi)
  lastWriter: RecordActor; // penulis versi ini
  payload: RecordPayloadMap[T];
  requestId: string;
  txId: string;
  timestamp: string; // ISO dari getTxTimestamp
  prevTxId: string | null;
  correction: CorrectionInfo | null;
}

export interface RecordHistoryEntry<T extends RecordType = RecordType> {
  txId: string;
  timestamp: string;
  isDelete: boolean;
  value: FormalRecord<T> | null;
}

export const CHAIN_ERROR_CODES = [
  'FORBIDDEN',
  'PRECONDITION_FAILED',
  'NOT_FOUND',
  'INVALID_ARGUMENT',
  'VERSION_CONFLICT',
  'AUDIT_CONFLICT',
] as const;
export type ChainErrorCode = (typeof CHAIN_ERROR_CODES)[number];

export const CHAINCODE = {
  channel: 'accreditation',
  name: 'formal-records',
  contract: 'FormalRecordContract',
} as const;

export const CHAIN_FUNCTIONS = {
  CreateSubmission: 'CreateSubmission',
  RecordAdminVerification: 'RecordAdminVerification',
  OfferAssessorPair: 'OfferAssessorPair',
  RespondAssignment: 'RespondAssignment',
  SubmitAssessmentResult: 'SubmitAssessmentResult',
  RecordFinalVerification: 'RecordFinalVerification',
  SetDecision: 'SetDecision',
  CorrectRecord: 'CorrectRecord',
  RecordAudit: 'RecordAudit',
  GetRecord: 'GetRecord',
  GetRecordHistory: 'GetRecordHistory',
  GetSubmissionRecords: 'GetSubmissionRecords',
  GetStage: 'GetStage',
  GetAuditEvents: 'GetAuditEvents',
  GetRecordByRequest: 'GetRecordByRequest',
} as const;
