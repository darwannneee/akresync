import type { AccreditationRank, AkStatus, AlScheduleStatus, AppRole, AuditStatus, SubmissionStage } from '@akreditasi/shared';

/* ============ Tahap & status ============ */
export const STAGE_LABEL: Record<SubmissionStage, string> = {
  draft: 'Draf pengajuan',
  submitted: 'Menunggu verifikasi kelengkapan',
  admin_revision: 'Perlu perbaikan dokumen',
  admin_rejected: 'Pengajuan ditolak',
  admin_verified: 'Dokumen lengkap, menunggu tagihan',
  invoice_issued: 'Menunggu bukti pembayaran',
  payment_proof_uploaded: 'Menunggu verifikasi pembayaran',
  payment_verified: 'Pembayaran terverifikasi',
  in_assessment: 'Dalam proses asesmen',
  al_submitted: 'Menunggu tanggapan UPPS',
  responses_completed: 'Menunggu verifikasi akhir',
  final_verified: 'Menunggu penetapan peringkat',
  decided: 'Peringkat ditetapkan',
  released: 'Hasil telah diterbitkan',
};

export const AK_LABEL: Record<AkStatus, string> = {
  not_started: 'Belum dimulai',
  offered: 'Menunggu persetujuan penugasan',
  offer_rejected: 'Penawaran ditolak',
  effective: 'Asesor bertugas',
  ak_partial: 'Baru satu asesor menyerahkan',
  ak_complete: 'Menunggu pemeriksaan konsistensi',
  consistency_returned: 'Dikembalikan untuk dinilai ulang',
  consistency_approved: 'Selesai dan konsisten',
};
export const AL_LABEL: Record<AlScheduleStatus, string> = {
  not_started: 'Belum diusulkan', proposed: 'Menunggu persetujuan', approved: 'Disetujui', rejected: 'Ditolak, perlu diusulkan ulang',
};

/* ============ Peran ============ */
export const ROLE_NAME: Record<AppRole, string> = {
  upps: 'UPPS',
  sek_adm: 'Sekretariat Administrasi',
  sek_keu: 'Sekretariat Keuangan',
  kea: 'Komite Evaluasi dan Akreditasi',
  asesor: 'Asesor',
  majelis: 'Majelis Akreditasi',
};
export const ROLE_SHORT: Record<AppRole, string> = {
  upps: 'UPPS', sek_adm: 'Sekretariat Administrasi', sek_keu: 'Sekretariat Keuangan', kea: 'KEA', asesor: 'Asesor', majelis: 'Majelis',
};
export const roleName = (r?: string | null) => (r && (ROLE_NAME as Record<string, string>)[r]) || (r === 'lead_assessor' ? 'Ketua asesor' : r === 'audit' ? 'Layanan audit' : r ?? '—');

/* ============ Catatan resmi & audit ============ */
export const RECORD_LABEL: Record<string, string> = {
  SUBMISSION: 'Pengajuan resmi',
  ADMIN_VERIFICATION: 'Verifikasi kelengkapan administrasi',
  ASSESSOR_OFFER: 'Penawaran pasangan asesor',
  ASSIGNMENT_RESPONSE: 'Tanggapan atas penugasan',
  ASSESSMENT_RESULT: 'Hasil asesmen',
  FINAL_VERIFICATION: 'Verifikasi akhir',
  DECISION: 'Penetapan peringkat akreditasi',
};
export const AUDIT_KIND_LABEL: Record<string, string> = {
  DocumentVersionSaved: 'Dokumen disimpan', InvoiceIssued: 'Tagihan diterbitkan', PaymentProofUploaded: 'Bukti pembayaran diunggah',
  PaymentVerified: 'Pembayaran dinyatakan sah', PaymentRejected: 'Pembayaran ditolak', AssignmentRejectionReviewed: 'Penolakan penugasan ditinjau',
  AssessmentDraftSaved: 'Draf penilaian disimpan', AKConsistencyApproved: 'Konsistensi hasil AK disetujui', AKConsistencyReturned: 'Hasil AK dikembalikan',
  ALScheduleProposed: 'Jadwal Asesmen Lapangan diusulkan', ALScheduleApproved: 'Jadwal Asesmen Lapangan disetujui', ALScheduleRejected: 'Jadwal Asesmen Lapangan ditolak',
  UPPSResponseSubmitted: 'Tanggapan UPPS disampaikan', LeadAssessorResponseSubmitted: 'Respons ketua asesor disampaikan', ResponsesCompleted: 'Tahap tanggapan selesai',
  CertificateIssued: 'Sertifikat diterbitkan', AIAnalysisSaved: 'Analisis pendukung disimpan',
};
export const AUDIT_STATUS_LABEL: Record<AuditStatus | 'saved', string> = {
  saved: 'Tersimpan', pending: 'Pencatatan tertunda', committed: 'Tercatat permanen', failed: 'Pencatatan gagal',
};
export const RECORD_STATUS_LABEL: Record<string, string> = { pending_chain: 'Menunggu konfirmasi', committed: 'Tercatat permanen', failed: 'Gagal dicatat' };

/* ============ Hasil, peringkat, respons ============ */
export const RESULT_LABEL: Record<string, string> = {
  APPROVED: 'Disetujui', REVISION_REQUIRED: 'Perlu perbaikan', REJECTED: 'Ditolak',
  approved: 'Disetujui', rejected: 'Ditolak', returned: 'Dikembalikan', verified: 'Terverifikasi', pending: 'Menunggu',
};
export const RANK_LABEL: Record<AccreditationRank, string> = { UNGGUL: 'Unggul', BAIK_SEKALI: 'Baik Sekali', BAIK: 'Baik', TIDAK_TERAKREDITASI: 'Tidak Terakreditasi' };
export const rankLabel = (r?: string | null) => (r ? (RANK_LABEL as Record<string, string>)[r] ?? r : '—');
export const OFFER_STATUS_LABEL: Record<string, string> = { offered: 'Menunggu tanggapan', effective: 'Berlaku', rejected: 'Ditolak', replaced: 'Digantikan penawaran baru' };
export const RESPONSE_LABEL: Record<string, string> = { ACCEPT: 'Menerima', REJECT: 'Menolak', accept: 'Menerima hasil', objection: 'Mengajukan keberatan', resolution: 'Tanggapan ketua asesor' };
export const PAYMENT_STATUS_LABEL: Record<string, string> = { issued: 'Menunggu pembayaran', proof_uploaded: 'Bukti bayar menunggu verifikasi', verified: 'Lunas dan terverifikasi', rejected: 'Bukti bayar ditolak' };
export const SCHEDULE_STATUS_LABEL: Record<string, string> = { proposed: 'Menunggu persetujuan', approved: 'Disetujui', rejected: 'Ditolak' };
export const MODE_LABEL: Record<string, string> = { luring: 'Luring (tatap muka)', daring: 'Daring', hibrida: 'Hibrida' };
export const ASSESS_STATUS_LABEL: Record<string, string> = { draft: 'Draf', submitted: 'Telah diserahkan' };
export const PHASE_LABEL: Record<string, string> = { AK: 'Asesmen Kecukupan', AL: 'Asesmen Lapangan' };
export const DOC_TYPE_LABEL: Record<string, string> = {
  LED: 'Laporan Evaluasi Diri (LED)', LKPS: 'Laporan Kinerja Program Studi (LKPS)', SUPPORT: 'Dokumen pendukung',
  PAYMENT_PROOF: 'Bukti pembayaran', AL_MINUTES: 'Berita Acara Asesmen Lapangan', CERTIFICATE: 'Sertifikat',
};
export const PAYLOAD_FIELD_LABEL: Record<string, string> = {
  institutionId: 'Institusi', programId: 'Program studi', documentSetVersion: 'Versi himpunan dokumen', documents: 'Dokumen',
  result: 'Hasil', notesSha256: 'Sidik jari catatan', offerNo: 'Nomor penawaran', assessorUids: 'Asesor', leadUid: 'Ketua asesor',
  replacesOfferSeq: 'Menggantikan penawaran', offerSeq: 'Urutan penawaran', responderRole: 'Peran penanggap', response: 'Tanggapan',
  reasonSha256: 'Sidik jari alasan', phase: 'Jenis asesmen', scoreSummarySha256: 'Sidik jari rekap skor', totalScore: 'Skor total',
  minutesCid: 'Berkas berita acara', minutesSha256: 'Sidik jari berita acara', alRecordKey: 'Catatan hasil AL', akRecordKeys: 'Catatan hasil AK',
  rank: 'Peringkat', decreeNumber: 'Nomor Surat Keputusan', validFrom: 'Berlaku sejak', validUntil: 'Berlaku sampai', finalVerificationKey: 'Catatan verifikasi akhir',
};

/* ============ Format ============ */
const TZ = 'Asia/Jakarta';
const parts = (d: Date, opt: Intl.DateTimeFormatOptions) => Object.fromEntries(new Intl.DateTimeFormat('id-ID', { timeZone: TZ, ...opt }).formatToParts(d).map((p) => [p.type, p.value]));
const valid = (s?: string | number | null): Date | null => {
  if (s === undefined || s === null || s === '') return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
/** 12 November 2026, 14.52 WIB */
export function fmtDateTime(s?: string | number | null): string {
  const d = valid(s);
  if (!d) return s ? String(s) : '—';
  const p = parts(d, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${p.day} ${p.month} ${p.year}, ${p.hour}.${p.minute} WIB`;
}
/** 12 November 2026 */
export function fmtDate(s?: string | number | null): string {
  if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDate(`${s}T12:00:00+07:00`);
  const d = valid(s);
  if (!d) return s ? String(s) : '—';
  const p = parts(d, { day: 'numeric', month: 'long', year: 'numeric' });
  return `${p.day} ${p.month} ${p.year}`;
}
export const fmtDateRange = (a?: string, b?: string) => `${fmtDate(a)} s.d. ${fmtDate(b)}`;
export const fmtRupiah = (n: number | string) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n));
export const fmtBytes = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const fmtNumber = (n: number | string | null | undefined, digits = 2) =>
  n === null || n === undefined || n === '' ? '—' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(Number(n));
export const short = (s?: string | null, head = 8, tail = 4) => (!s ? '—' : s.length > head + tail + 1 ? `${s.slice(0, head)}…${tail ? s.slice(-tail) : ''}` : s);
export const shortId = (id: string) => id.slice(0, 8).toUpperCase();
