import type { AkStatus, AlScheduleStatus, SubmissionStage } from '@akreditasi/shared';
import { conflict } from './errors.js';

export interface FlowState {
  stage: SubmissionStage;
  akStatus: AkStatus;
  alStatus: AlScheduleStatus;
}

export type FlowAction =
  | 'upload_document'
  | 'submit'
  | 'admin_verification'
  | 'issue_invoice'
  | 'upload_payment_proof'
  | 'verify_payment'
  | 'offer_assessors'
  | 'respond_offer'
  | 'review_offer_rejection'
  | 'assessment_ak'
  | 'ak_consistency'
  | 'propose_al_schedule'
  | 'decide_al_schedule'
  | 'assessment_al'
  | 'upps_response'
  | 'lead_response'
  | 'final_verification'
  | 'decision'
  | 'issue_certificate';

interface Rule {
  label: string;
  stages: SubmissionStage[];
  ak?: AkStatus[];
  al?: AlScheduleStatus[];
  hint: string;
}

const RULES: Record<FlowAction, Rule> = {
  upload_document: { label: 'Unggah dokumen', stages: ['draft', 'admin_revision'], hint: 'hanya pada draf atau saat perlu revisi administrasi' },
  submit: { label: 'Pengajuan', stages: ['draft', 'admin_revision'], hint: 'pengajuan hanya dari draf atau setelah revisi administrasi' },
  admin_verification: { label: 'Verifikasi kelengkapan', stages: ['submitted'], hint: 'menunggu pengajuan berstatus terkirim' },
  issue_invoice: { label: 'Penerbitan tagihan', stages: ['admin_verified'], hint: 'verifikasi kelengkapan harus disetujui terlebih dahulu' },
  upload_payment_proof: { label: 'Unggah bukti bayar', stages: ['invoice_issued'], hint: 'tagihan harus sudah diterbitkan dan belum ada bukti yang menunggu verifikasi' },
  verify_payment: { label: 'Verifikasi pembayaran', stages: ['payment_proof_uploaded'], hint: 'bukti bayar harus sudah diunggah' },
  offer_assessors: {
    label: 'Penawaran asesor',
    stages: ['payment_verified', 'in_assessment'],
    ak: ['not_started', 'offer_rejected'],
    hint: 'pembayaran harus terverifikasi; penawaran ulang hanya setelah penolakan ditinjau',
  },
  respond_offer: { label: 'Respons penugasan', stages: ['in_assessment'], ak: ['offered'], hint: 'tidak ada penawaran aktif yang menunggu respons' },
  review_offer_rejection: { label: 'Tinjauan penolakan', stages: ['in_assessment'], ak: ['offer_rejected'], hint: 'tidak ada penolakan penugasan untuk ditinjau' },
  assessment_ak: {
    label: 'Asesmen kecukupan (AK)',
    stages: ['in_assessment'],
    ak: ['effective', 'ak_partial', 'consistency_returned'],
    hint: 'penugasan harus sudah berlaku; AK tidak dapat diubah setelah lengkap kecuali dikembalikan KEA',
  },
  ak_consistency: { label: 'Konsistensi AK', stages: ['in_assessment'], ak: ['ak_complete'], hint: 'kedua asesor harus sudah menyelesaikan AK' },
  propose_al_schedule: {
    label: 'Usulan jadwal AL',
    stages: ['payment_verified', 'in_assessment'],
    al: ['not_started', 'rejected'],
    hint: 'sudah ada usulan jadwal yang aktif atau pembayaran belum terverifikasi',
  },
  decide_al_schedule: { label: 'Keputusan jadwal AL', stages: ['payment_verified', 'in_assessment'], al: ['proposed'], hint: 'tidak ada usulan jadwal yang menunggu keputusan' },
  assessment_al: {
    label: 'Asesmen lapangan (AL)',
    stages: ['in_assessment'],
    ak: ['consistency_approved'],
    al: ['approved'],
    hint: 'konsistensi AK dan jadwal AL harus sudah disetujui (kedua cabang selesai)',
  },
  upps_response: { label: 'Tanggapan UPPS', stages: ['al_submitted'], hint: 'AL harus sudah diserahkan' },
  lead_response: { label: 'Respons ketua asesor', stages: ['al_submitted'], hint: 'hanya setelah UPPS mengajukan keberatan' },
  final_verification: { label: 'Verifikasi akhir', stages: ['responses_completed'], hint: 'tanggapan UPPS harus selesai' },
  decision: { label: 'Penetapan', stages: ['final_verified'], hint: 'verifikasi akhir KEA harus selesai' },
  issue_certificate: { label: 'Penerbitan hasil', stages: ['decided'], hint: 'penetapan Majelis harus selesai' },
};

/** Pesan galat (Indonesia) bila urutan alur dilanggar; null bila boleh. */
export function flowViolation(action: FlowAction, s: FlowState): string | null {
  const r = RULES[action];
  const ok = r.stages.includes(s.stage) && (!r.ak || r.ak.includes(s.akStatus)) && (!r.al || r.al.includes(s.alStatus));
  if (ok) return null;
  return `${r.label} belum dapat dilakukan: ${r.hint}. Tahap saat ini: ${s.stage}${s.stage === 'in_assessment' ? ` (AK: ${s.akStatus}, jadwal AL: ${s.alStatus})` : ''}.`;
}

export function assertFlow(action: FlowAction, s: FlowState): void {
  const msg = flowViolation(action, s);
  if (msg) throw conflict(msg, { action, ...s });
}

export const stateOf = (row: { stage: string; ak_status: string; al_schedule_status: string }): FlowState => ({
  stage: row.stage as SubmissionStage,
  akStatus: row.ak_status as AkStatus,
  alStatus: row.al_schedule_status as AlScheduleStatus,
});
