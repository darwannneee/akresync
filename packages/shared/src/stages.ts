/**
 * Tahap pengajuan di aplikasi (proyeksi off-chain, lengkap termasuk tahap off-chain).
 * Urutan alur bisnis tidak boleh diubah:
 * pengajuan → verifikasi kelengkapan → tagihan & pembayaran →
 * paralel [penugasan asesor → AK → konsistensi] & [jadwal AL] → AL → tanggapan →
 * verifikasi akhir KEA → penetapan Majelis → penerbitan hasil.
 */
export const SUBMISSION_STAGES = [
  'draft',
  'submitted',
  'admin_revision',
  'admin_rejected',
  'admin_verified',
  'invoice_issued',
  'payment_proof_uploaded',
  'payment_verified',
  'in_assessment', // cabang paralel aktif (lihat AkStatus & AlScheduleStatus)
  'al_submitted',
  'responses_completed',
  'final_verified',
  'decided',
  'released',
] as const;
export type SubmissionStage = (typeof SUBMISSION_STAGES)[number];

/** Cabang A: penugasan asesor + asesmen kecukupan. */
export const AK_STATUSES = [
  'not_started',
  'offered',
  'offer_rejected',
  'effective',
  'ak_partial',
  'ak_complete',
  'consistency_returned',
  'consistency_approved',
] as const;
export type AkStatus = (typeof AK_STATUSES)[number];

/** Cabang B: penjadwalan asesmen lapangan. */
export const AL_SCHEDULE_STATUSES = ['not_started', 'proposed', 'approved', 'rejected'] as const;
export type AlScheduleStatus = (typeof AL_SCHEDULE_STATUSES)[number];

/** Tahap yang dijaga chaincode (hanya transisi on-chain). */
export const CHAIN_STAGES = [
  'SUBMITTED',
  'ADMIN_REVISION',
  'ADMIN_REJECTED',
  'ADMIN_VERIFIED',
  'ASSIGNMENT_OFFERED',
  'ASSIGNMENT_EFFECTIVE',
  'AK_PARTIAL',
  'AK_COMPLETE',
  'AL_SUBMITTED',
  'FINAL_VERIFIED',
  'DECIDED',
] as const;
export type ChainStage = (typeof CHAIN_STAGES)[number];

export interface ChainOfferState {
  offerSeq: number;
  assessorUids: [string, string];
  leadUid: string;
  responses: Record<string, 'ACCEPT' | 'REJECT'>; // key: uid responden
  rejected: boolean;
  akSubmittedBy: string[];
}

/** Nilai kunci STAGE~submissionId di world state. */
export interface ChainStageState {
  submissionId: string;
  stage: ChainStage;
  ownerUid: string;
  documentSetVersion: number;
  activeOffer: ChainOfferState | null;
  updatedTxId: string;
}
