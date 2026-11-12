import type { AppRole } from './roles.js';
import type { AuditStatus } from './audit.js';

/** Kelas penyimpanan aksi: O = off-chain murni, A = off-chain + audit outbox, C = transaksi chaincode langsung. */
export type StorageClass = 'O' | 'A' | 'C';

export interface ChainReceipt {
  txId: string;
  status: 'VALID';
  blockNumber: string;
  recordKey: string;
  version: number;
}

export interface AuditReceipt {
  eventIds: string[];
  status: AuditStatus;
}

export interface ApiEnvelope<T> {
  data: T;
  chain?: ChainReceipt;
  audit?: AuditReceipt;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface RouteSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  roles: AppRole[] | 'public' | 'authenticated';
  storage: StorageClass;
  description: string;
}

const ALL: 'authenticated' = 'authenticated';

/** Daftar endpoint /api/v1. Backend dan frontend wajib mengikuti path & peran ini. */
export const API_ROUTES = {
  // Autentikasi & master (O)
  register: { method: 'POST', path: '/auth/register', roles: 'public', storage: 'O', description: 'Registrasi mandiri UPPS (multipart: field data JSON + berkas photo?, sppa, spsu); akun menunggu verifikasi Sekretariat Administrasi' },
  login: { method: 'POST', path: '/auth/login', roles: 'public', storage: 'O', description: 'Masuk, kembalikan access token + set refresh cookie' },
  refresh: { method: 'POST', path: '/auth/refresh', roles: 'public', storage: 'O', description: 'Perbarui access token' },
  logout: { method: 'POST', path: '/auth/logout', roles: ALL, storage: 'O', description: 'Cabut refresh token' },
  me: { method: 'GET', path: '/auth/me', roles: ALL, storage: 'O', description: 'Profil pengguna aktif' },
  institutions: { method: 'GET', path: '/institutions', roles: 'public', storage: 'O', description: 'Daftar institusi' },
  programs: { method: 'GET', path: '/institutions/:institutionId/programs', roles: 'public', storage: 'O', description: 'Program studi per institusi' },
  refLevels: { method: 'GET', path: '/ref/levels', roles: 'public', storage: 'O', description: 'Daftar jenjang program studi' },
  refProgramNames: { method: 'GET', path: '/ref/program-names', roles: 'public', storage: 'O', description: 'Daftar nama program studi' },
  assessors: { method: 'GET', path: '/assessors', roles: ['kea'], storage: 'O', description: 'Daftar asesor aktif' },

  // Verifikasi akun UPPS oleh Sekretariat Administrasi (O)
  listUppsRegistrations: { method: 'GET', path: '/upps-registrations', roles: ['sek_adm'], storage: 'O', description: 'Daftar registrasi UPPS (?status=)' },
  getUppsRegistration: { method: 'GET', path: '/upps-registrations/:id', roles: ['sek_adm'], storage: 'O', description: 'Detail registrasi UPPS + baris prodi' },
  downloadUppsRegistrationFile: { method: 'GET', path: '/upps-registrations/:id/files/:kind', roles: ['sek_adm'], storage: 'O', description: 'Unduh berkas registrasi (kind = photo|sppa|spsu) + verifikasi SHA-256' },
  decideUppsRegistration: { method: 'POST', path: '/upps-registrations/:id/decision', roles: ['sek_adm'], storage: 'O', description: 'Setujui (enroll identitas Fabric + buat prodi) atau tolak {result: approved|rejected, note}' },

  // Pengajuan & dokumen
  createDraft: { method: 'POST', path: '/submissions', roles: ['upps'], storage: 'O', description: 'Buat draf pengajuan' },
  listSubmissions: { method: 'GET', path: '/submissions', roles: ALL, storage: 'O', description: 'Daftar pengajuan sesuai peran' },
  getSubmission: { method: 'GET', path: '/submissions/:id', roles: ALL, storage: 'O', description: 'Detail + catatan formal + status audit' },
  uploadDocument: { method: 'POST', path: '/submissions/:id/documents', roles: ['upps'], storage: 'A', description: 'Unggah LED/LKPS/pendukung (multipart: file, docType)' },
  downloadDocument: { method: 'GET', path: '/documents/:documentId/download', roles: ALL, storage: 'O', description: 'Unduh + dekripsi + verifikasi SHA-256' },
  submit: { method: 'POST', path: '/submissions/:id/submit', roles: ['upps'], storage: 'C', description: 'CreateSubmission' },
  adminVerification: { method: 'POST', path: '/submissions/:id/admin-verification', roles: ['sek_adm'], storage: 'C', description: 'RecordAdminVerification {result, notes}' },

  // Pembayaran (A)
  issueInvoice: { method: 'POST', path: '/submissions/:id/invoice', roles: ['sek_keu'], storage: 'A', description: 'Terbitkan tagihan {amount}' },
  uploadPaymentProof: { method: 'POST', path: '/submissions/:id/payment-proof', roles: ['upps'], storage: 'A', description: 'Unggah bukti bayar (multipart)' },
  verifyPayment: { method: 'POST', path: '/submissions/:id/payment-verification', roles: ['sek_keu'], storage: 'A', description: 'Verifikasi bayar {result: verified|rejected, notes}' },

  // Cabang A: penugasan + AK
  offerAssessors: { method: 'POST', path: '/submissions/:id/offers', roles: ['kea'], storage: 'C', description: 'OfferAssessorPair {assessor1Id, assessor2Id, leadAssessorId}' },
  respondOffer: { method: 'POST', path: '/offers/:offerId/responses', roles: ['asesor', 'upps'], storage: 'C', description: 'RespondAssignment {response, reason}' },
  reviewOfferRejection: { method: 'POST', path: '/offers/:offerId/rejection-review', roles: ['kea'], storage: 'A', description: 'Tinjau penolakan penugasan {notes}' },
  saveAssessmentDraft: { method: 'PUT', path: '/submissions/:id/assessments/:phase/draft', roles: ['asesor'], storage: 'A', description: 'Simpan skor rinci {scores}' },
  submitAssessment: { method: 'POST', path: '/submissions/:id/assessments/:phase/submit', roles: ['asesor'], storage: 'C', description: 'SubmitAssessmentResult (AL: setelah unggah berita acara)' },
  uploadAlMinutes: { method: 'POST', path: '/submissions/:id/al-minutes', roles: ['asesor'], storage: 'A', description: 'Unggah berita acara AL (multipart, ketua asesor)' },
  akConsistency: { method: 'POST', path: '/submissions/:id/ak-consistency', roles: ['kea'], storage: 'A', description: 'Konsistensi AK {result: approved|returned, notes}' },

  // Cabang B: jadwal AL (A)
  proposeAlSchedule: { method: 'POST', path: '/submissions/:id/al-schedules', roles: ['kea'], storage: 'A', description: 'Usul jadwal {startDate, endDate, location, mode}' },
  decideAlSchedule: { method: 'POST', path: '/al-schedules/:scheduleId/decision', roles: ['sek_adm'], storage: 'A', description: 'Setujui/tolak jadwal {result: approved|rejected, notes}' },

  // Tanggapan (A)
  uppsResponse: { method: 'POST', path: '/submissions/:id/responses', roles: ['upps'], storage: 'A', description: 'Tanggapan UPPS {type: accept|objection, body}' },
  leadResponse: { method: 'POST', path: '/submissions/:id/responses/lead', roles: ['asesor'], storage: 'A', description: 'Respons ketua asesor atas keberatan {body}' },

  // Verifikasi akhir, penetapan, penerbitan
  finalVerification: { method: 'POST', path: '/submissions/:id/final-verification', roles: ['kea'], storage: 'C', description: 'RecordFinalVerification {notes}' },
  decision: { method: 'POST', path: '/submissions/:id/decision', roles: ['majelis'], storage: 'C', description: 'SetDecision {rank, decreeNumber, validFrom, validUntil}' },
  issueCertificate: { method: 'POST', path: '/submissions/:id/certificate', roles: ['sek_adm'], storage: 'A', description: 'Terbitkan hasil/sertifikat PDF' },
  downloadCertificate: { method: 'GET', path: '/certificates/:certificateId/download', roles: ALL, storage: 'O', description: 'Unduh sertifikat + validasi ke keputusan on-chain' },

  // Koreksi & riwayat
  correctRecord: { method: 'POST', path: '/formal-records/:recordId/corrections', roles: ['upps', 'sek_adm', 'kea', 'asesor', 'majelis'], storage: 'C', description: 'CorrectRecord {payload, reason, evidenceRef, expectedVersion}' },
  recordHistory: { method: 'GET', path: '/formal-records/:recordId/history', roles: ALL, storage: 'O', description: 'Riwayat versi dari getHistoryForKey' },

  // Audit & evaluasi
  submissionAudit: { method: 'GET', path: '/submissions/:id/audit', roles: ALL, storage: 'O', description: 'Peristiwa audit + statusnya' },
  verifyAudit: { method: 'GET', path: '/audit/:eventId/verify', roles: ALL, storage: 'O', description: 'Hitung ulang hash snapshot vs ledger' },
  submissionMetrics: { method: 'GET', path: '/metrics/submissions/:id', roles: ['kea', 'majelis', 'sek_adm'], storage: 'O', description: 'Jumlah tx on-chain, ukuran payload, jeda audit' },
  dashboardStats: { method: 'GET', path: '/dashboard/stats', roles: ALL, storage: 'O', description: 'Statistik dasbor (KPI, tahap, tren, peringkat, integritas chain, AI, aktivitas) sesuai visibilitas peran' },
  publicStats: { method: 'GET', path: '/public/stats', roles: 'public', storage: 'O', description: 'Angka agregat publik untuk halaman masuk (jumlah pengajuan dan catatan on-chain), tanpa data pribadi' },
  eventStream: { method: 'GET', path: '/events/stream', roles: ALL, storage: 'O', description: 'SSE audit_status & record_committed' },
  // Modul AI pendukung keputusan (O/A)
  requestAiAnalysis: { method: 'POST', path: '/submissions/:id/ai-analyses', roles: ['asesor', 'kea'], storage: 'A', description: 'Analisis ulang AI manual {phase}; 202 + id (analisis awal berjalan otomatis saat LED+LKPS lengkap)' },
  listAiAnalyses: { method: 'GET', path: '/submissions/:id/ai-analyses', roles: ['upps', 'asesor', 'kea', 'majelis', 'sek_adm'], storage: 'O', description: 'Riwayat analisis AI + perbandingan dengan skor akhir' },
  getAiAnalysis: { method: 'GET', path: '/ai-analyses/:analysisId', roles: ['upps', 'asesor', 'kea', 'majelis', 'sek_adm'], storage: 'O', description: 'Detail analisis AI termasuk kutipan sumber' },
  reindexDocuments: { method: 'POST', path: '/submissions/:id/reindex', roles: ['kea', 'sek_adm'], storage: 'O', description: 'Indeks ulang dokumen LED/LKPS set terbaru' },
  health: { method: 'GET', path: '/health', roles: 'public', storage: 'O', description: 'Status DB, Fabric, IPFS, Kafka' },
} as const satisfies Record<string, RouteSpec>;

/** Respons GET /dashboard/stats. Seluruh angka dibatasi pada pengajuan yang boleh dilihat peran pemanggil. */
export interface DashboardStats {
  generatedAt: string;
  scope: 'own' | 'assigned' | 'all';
  kpis: {
    total: number;
    /** Perkiraan sisi server: pengajuan yang posisinya menunggu peran ini. Daftar tugas resmi memakai nextActions di klien. */
    actionRequired: number;
    inProgress: number;
    completed: number;
    /** Rerata hari dari pengajuan dibuat sampai keputusan tercatat; null bila belum ada keputusan. */
    avgDecisionDays: number | null;
  };
  /** Sembilan tahap alur berurutan + "Selesai". */
  byStage: { index: number; key: string; label: string; count: number }[];
  /** 12 bulan terakhir, urut lama ke baru. month = 'YYYY-MM'. */
  monthly: { month: string; submitted: number; decided: number }[];
  ranks: { rank: 'UNGGUL' | 'BAIK_SEKALI' | 'BAIK' | 'TIDAK_TERAKREDITASI'; count: number }[];
  chain: {
    onChainTx: number;
    corrections: number;
    audit: { pending: number; committed: number; failed: number };
    auditLagAvgSec: number | null;
    auditLagP95Sec: number | null;
    lastBlock: number | null;
  };
  ai: {
    byStatus: { status: string; count: number }[];
    avgLatencySec: number | null;
    /** Analisis selesai yang total skor sarannya berada dalam 10% skor maksimum dari rerata skor akhir asesor. */
    agreement: { compared: number; within: number; meanAbsDiffPct: number | null };
  };
  recent: {
    kind: 'record' | 'audit';
    type: string;
    status: string;
    at: string;
    submissionId: string | null;
    programName: string | null;
    institutionName: string | null;
  }[];
}

/** Respons GET /public/stats. */
export interface PublicStats { submissions: number; onChainTx: number }

export const API_PREFIX = '/api/v1';
