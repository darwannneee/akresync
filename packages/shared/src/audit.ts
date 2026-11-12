import type { AppRole } from './roles.js';

/** Jenis peristiwa off-chain yang dicatat ke ledger melalui outbox → Debezium → Kafka → layanan audit. */
export const AUDIT_EVENT_KINDS = [
  'DocumentVersionSaved',
  'InvoiceIssued',
  'PaymentProofUploaded',
  'PaymentVerified',
  'PaymentRejected',
  'AssignmentRejectionReviewed',
  'AssessmentDraftSaved',
  'AKConsistencyApproved',
  'AKConsistencyReturned',
  'ALScheduleProposed',
  'ALScheduleApproved',
  'ALScheduleRejected',
  'UPPSResponseSubmitted',
  'LeadAssessorResponseSubmitted',
  'ResponsesCompleted',
  'CertificateIssued',
  'AIAnalysisSaved',
] as const;
export type AuditEventKind = (typeof AUDIT_EVENT_KINDS)[number];

/** Peristiwa audit yang menjadi prasyarat (gating) fungsi chaincode. */
export const GATE_EVENT_KINDS = {
  OfferAssessorPair: 'PaymentVerified',
  ReOfferAssessorPair: 'AssignmentRejectionReviewed',
  SubmitAssessmentResultAL: ['AKConsistencyApproved', 'ALScheduleApproved'],
  RecordFinalVerification: 'ResponsesCompleted',
} as const;

/** Nilai `outbox.aggregatetype` → topik Kafka `audit.<aggregatetype>`. */
export const AGGREGATE_TYPES = [
  'document_version',
  'payment',
  'assessor_offer',
  'assessment',
  'al_schedule',
  'upps_response',
  'certificate',
  'ai_analysis',
] as const;
export type AggregateType = (typeof AGGREGATE_TYPES)[number];

/** Isi yang dikirim ke chaincode RecordAudit. Tidak boleh memuat data pribadi/isi dokumen. */
export interface AuditEvent {
  eventId: string; // = outbox.id (uuid)
  aggregateType: AggregateType;
  aggregateId: string;
  submissionId: string | null;
  kind: AuditEventKind;
  version: number; // versi agregat (naik per perubahan)
  payloadSha256: string; // sha256(canonicalJson(snapshot))
  actorUid: string;
  actorRole: AppRole;
  occurredAt: string; // ISO
}

/** Isi kolom outbox.payload. */
export interface OutboxPayload {
  event: AuditEvent;
  snapshot: Record<string, unknown>; // salinan baris domain saat peristiwa, tidak dikirim ke chain
}

export const AUDIT_STATUSES = ['pending', 'committed', 'failed'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

/** Catatan audit yang tersimpan di world state (AUDIT~eventId). */
export interface AuditLedgerEntry extends AuditEvent {
  docType: 'auditEvent';
  txId: string;
  recordedAt: string;
}
