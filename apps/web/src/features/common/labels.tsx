import type { AkStatus, AlScheduleStatus, AuditStatus, SubmissionStage } from '@akreditasi/shared';
import { Badge, type Tone } from '../../components/ui';

export const STAGE_LABEL: Record<SubmissionStage, string> = {
  draft: 'Draf',
  submitted: 'Diajukan',
  admin_revision: 'Perlu revisi administrasi',
  admin_rejected: 'Ditolak administrasi',
  admin_verified: 'Administrasi terverifikasi',
  invoice_issued: 'Tagihan terbit',
  payment_proof_uploaded: 'Bukti bayar diunggah',
  payment_verified: 'Pembayaran terverifikasi',
  in_assessment: 'Dalam asesmen',
  al_submitted: 'Hasil AL disampaikan',
  responses_completed: 'Tanggapan selesai',
  final_verified: 'Verifikasi akhir selesai',
  decided: 'Telah ditetapkan',
  released: 'Hasil diterbitkan',
};
const STAGE_TONE: Partial<Record<SubmissionStage, Tone>> = {
  admin_revision: 'warn', admin_rejected: 'danger', decided: 'accent', released: 'success', draft: 'neutral',
};
export const StageBadge = ({ stage }: { stage: SubmissionStage }) => <Badge tone={STAGE_TONE[stage] ?? 'info'}>{STAGE_LABEL[stage] ?? stage}</Badge>;

export const AK_LABEL: Record<AkStatus, string> = {
  not_started: 'Belum dimulai', offered: 'Penawaran diajukan', offer_rejected: 'Penawaran ditolak', effective: 'Penugasan berlaku',
  ak_partial: 'AK sebagian', ak_complete: 'AK lengkap', consistency_returned: 'Dikembalikan KEA', consistency_approved: 'Konsistensi disetujui',
};
export const AL_LABEL: Record<AlScheduleStatus, string> = { not_started: 'Belum diusulkan', proposed: 'Diusulkan', approved: 'Disetujui', rejected: 'Ditolak' };

export const AUDIT_BADGE: Record<AuditStatus | 'saved', { label: string; tone: Tone }> = {
  saved: { label: 'Tersimpan (DB)', tone: 'neutral' },
  pending: { label: 'Audit tertunda', tone: 'warn' },
  committed: { label: 'Tercatat on-chain', tone: 'success' },
  failed: { label: 'Gagal', tone: 'danger' },
};
export function AuditBadge({ status }: { status?: AuditStatus | 'saved' | null }) {
  const b = AUDIT_BADGE[status ?? 'saved'] ?? AUDIT_BADGE.saved;
  return <Badge tone={b.tone}>{b.label}</Badge>;
}

export const RECORD_LABEL: Record<string, string> = {
  SUBMISSION: 'Pengajuan', ADMIN_VERIFICATION: 'Verifikasi administrasi', ASSESSOR_OFFER: 'Penawaran asesor',
  ASSIGNMENT_RESPONSE: 'Respons penugasan', ASSESSMENT_RESULT: 'Hasil asesmen', FINAL_VERIFICATION: 'Verifikasi akhir', DECISION: 'Keputusan akreditasi',
};
export const AUDIT_KIND_LABEL: Record<string, string> = {
  DocumentVersionSaved: 'Versi dokumen disimpan', InvoiceIssued: 'Tagihan diterbitkan', PaymentProofUploaded: 'Bukti bayar diunggah',
  PaymentVerified: 'Pembayaran terverifikasi', PaymentRejected: 'Pembayaran ditolak', AssignmentRejectionReviewed: 'Penolakan penugasan ditinjau',
  AssessmentDraftSaved: 'Draf penilaian disimpan', AKConsistencyApproved: 'Konsistensi AK disetujui', AKConsistencyReturned: 'Konsistensi AK dikembalikan',
  ALScheduleProposed: 'Jadwal AL diusulkan', ALScheduleApproved: 'Jadwal AL disetujui', ALScheduleRejected: 'Jadwal AL ditolak',
  UPPSResponseSubmitted: 'Tanggapan UPPS', LeadAssessorResponseSubmitted: 'Respons ketua asesor', ResponsesCompleted: 'Tanggapan selesai',
  CertificateIssued: 'Sertifikat diterbitkan', AIAnalysisSaved: 'Analisis AI disimpan',
};

export const short = (s?: string | null, head = 8, tail = 4) => (!s ? '—' : s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s);
export const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
};
export const fmtRupiah = (n: number | string) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n));
export const fmtBytes = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
