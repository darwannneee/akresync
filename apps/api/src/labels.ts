import type { AkStatus, AlScheduleStatus, AppRole, SubmissionStage } from '@akreditasi/shared';

/** Label tahap untuk pesan ke pengguna (selaras dengan label di antarmuka web). */
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
  not_started: 'belum dimulai',
  offered: 'menunggu persetujuan penugasan',
  offer_rejected: 'penawaran ditolak',
  effective: 'asesor bertugas',
  ak_partial: 'baru satu asesor menyerahkan',
  ak_complete: 'menunggu pemeriksaan konsistensi',
  consistency_returned: 'dikembalikan untuk dinilai ulang',
  consistency_approved: 'selesai dan konsisten',
};

export const AL_LABEL: Record<AlScheduleStatus, string> = {
  not_started: 'belum diusulkan',
  proposed: 'menunggu persetujuan',
  approved: 'disetujui',
  rejected: 'ditolak, perlu diusulkan ulang',
};

export const ROLE_NAME: Record<AppRole, string> = {
  upps: 'UPPS',
  sek_adm: 'Sekretariat Administrasi',
  sek_keu: 'Sekretariat Keuangan',
  kea: 'Komite Evaluasi dan Akreditasi',
  asesor: 'Asesor',
  majelis: 'Majelis Akreditasi',
};

/** "A", "A dan B", "A, B, dan C". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} dan ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, dan ${items[items.length - 1]}`;
}

export const rolesText = (roles: readonly AppRole[]): string => joinList(roles.map((r) => ROLE_NAME[r] ?? r));

/** Nama tahap di chaincode → kalimat bahasa Indonesia. */
export const CHAIN_STAGE_LABEL: Record<string, string> = {
  SUBMITTED: 'pengajuan terkirim',
  ADMIN_REVISION: 'perlu perbaikan dokumen',
  ADMIN_REJECTED: 'pengajuan ditolak',
  ADMIN_VERIFIED: 'dokumen dinyatakan lengkap',
  ASSIGNMENT_OFFERED: 'penawaran asesor menunggu tanggapan',
  ASSIGNMENT_EFFECTIVE: 'penugasan asesor berlaku',
  AK_PARTIAL: 'asesmen kecukupan baru diserahkan satu asesor',
  AK_COMPLETE: 'asesmen kecukupan lengkap',
  AL_SUBMITTED: 'asesmen lapangan telah diserahkan',
  FINAL_VERIFIED: 'verifikasi akhir selesai',
  DECIDED: 'peringkat ditetapkan',
};

/** Terjemahkan sisa istilah teknis pada pesan chaincode agar dapat dipahami pengguna. */
export function humanizeChainMessage(msg: string): string {
  let out = msg;
  out = out.replace(/\btahap ([A-Z_]+)/g, (_m, s: string) => `tahap "${CHAIN_STAGE_LABEL[s] ?? s}"`);
  out = out.replace(/diharapkan: ([A-Z_ /]+)\)/g, (_m, list: string) => `diharapkan: ${list.split(' / ').map((s) => CHAIN_STAGE_LABEL[s.trim()] ?? s.trim()).join(' atau ')})`);
  out = out.replace(/bukti audit (\w+) belum tercatat/g, 'bukti pencatatan permanen ($1) belum tersedia');
  return out;
}
