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
  register: { method: 'POST', path: '/auth/register', roles: 'public', storage: 'O', description: 'Registrasi akun UPPS' },
  login: { method: 'POST', path: '/auth/login', roles: 'public', storage: 'O', description: 'Masuk, kembalikan access token + set refresh cookie' },
  refresh: { method: 'POST', path: '/auth/refresh', roles: 'public', storage: 'O', description: 'Perbarui access token' },
  logout: { method: 'POST', path: '/auth/logout', roles: ALL, storage: 'O', description: 'Cabut refresh token' },
  me: { method: 'GET', path: '/auth/me', roles: ALL, storage: 'O', description: 'Profil pengguna aktif' },
  institutions: { method: 'GET', path: '/institutions', roles: 'public', storage: 'O', description: 'Daftar institusi' },
  programs: { method: 'GET', path: '/institutions/:institutionId/programs', roles: 'public', storage: 'O', description: 'Program studi per institusi' },
  assessors: { method: 'GET', path: '/assessors', roles: ['kea'], storage: 'O', description: 'Daftar asesor aktif' },

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
  eventStream: { method: 'GET', path: '/events/stream', roles: ALL, storage: 'O', description: 'SSE audit_status & record_committed' },
  // Modul AI pendukung keputusan (O/A)
  requestAiAnalysis: { method: 'POST', path: '/submissions/:id/ai-analyses', roles: ['asesor', 'kea'], storage: 'A', description: 'Analisis ulang AI manual {phase}; 202 + id (analisis awal berjalan otomatis saat LED+LKPS lengkap)' },
  listAiAnalyses: { method: 'GET', path: '/submissions/:id/ai-analyses', roles: ['upps', 'asesor', 'kea', 'majelis', 'sek_adm'], storage: 'O', description: 'Riwayat analisis AI + perbandingan dengan skor akhir' },
  getAiAnalysis: { method: 'GET', path: '/ai-analyses/:analysisId', roles: ['upps', 'asesor', 'kea', 'majelis', 'sek_adm'], storage: 'O', description: 'Detail analisis AI termasuk kutipan sumber' },
  reindexDocuments: { method: 'POST', path: '/submissions/:id/reindex', roles: ['kea', 'sek_adm'], storage: 'O', description: 'Indeks ulang dokumen LED/LKPS set terbaru' },
  health: { method: 'GET', path: '/health', roles: 'public', storage: 'O', description: 'Status DB, Fabric, IPFS, Kafka' },
} as const satisfies Record<string, RouteSpec>;

export const API_PREFIX = '/api/v1';
