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
  rejectionReviewNotes?: string | null;
  rejectionReviewedAt?: string | null;
  consistencyStatus?: 'pending' | 'approved' | 'returned';
  consistencyNotes?: string | null;
}

export interface AssessmentView {
  id: string;
  offerId?: string;
  assessorId: string;
  assessorName?: string;
  phase: 'AK' | 'AL';
  status: 'draft' | 'submitted';
  scores?: Record<string, Record<string, number>>;
  totalScore?: number | string | null;
  minutesDocumentId?: string | null;
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

export interface CertificateView { id: string; certificateNo: string; issuedAt?: string }

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
