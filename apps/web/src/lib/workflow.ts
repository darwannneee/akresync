/**
 * Sumber tunggal alur akreditasi di sisi web: 9 tahap utama, sub-langkah (termasuk dua jalur paralel
 * AK dan Jadwal AL), peran penanggung jawab, kelas penyimpanan, status tiap langkah, dan tindakan berikutnya.
 * Urutan bisnis mengikuti packages/shared (tidak diubah di sini).
 */
import type { AppRole, StorageClass } from '@akreditasi/shared';
import type { AuditEventView, FormalRecordView, SubmissionDetail, SubmissionSummary, User } from '../api/types';
import { AUDIT_KIND_LABEL, RECORD_LABEL, roleName } from './labels';

export type StepStatus = 'selesai' | 'aktif' | 'menunggu' | 'terkunci' | 'ditolak';
export const STATUS_LABEL: Record<StepStatus, string> = {
  selesai: 'Selesai', aktif: 'Sedang berjalan', menunggu: 'Menunggu pihak lain', terkunci: 'Belum dimulai', ditolak: 'Ditolak',
};
export const STORAGE_NOTE: Record<StorageClass, string> = {
  C: 'Dicatat permanen dan tidak dapat diubah',
  A: 'Tersimpan, dengan jejak audit yang dicatat permanen',
  O: 'Tersimpan di sistem',
};

export type Detail = SubmissionSummary & Partial<Omit<SubmissionDetail, keyof SubmissionSummary>>;

export interface SubStep {
  id: string;
  label: string;
  roleLabel: string;
  role: AppRole | 'asesor_upps';
  storage: StorageClass;
  status: StepStatus;
  note?: string;
}
export interface MainStage {
  no: number; // 1..9
  id: string;
  label: string;
  short: string;
  roleLabel: string;
  storage: StorageClass;
  status: StepStatus;
  parallel: boolean;
  steps: SubStep[];
  lanes?: { ak: SubStep[]; al: SubStep[] };
  note?: string;
}

/* ---------------- Bantuan membaca detail ---------------- */
const inBranch = (d: Detail) => d.stage === 'payment_verified' || d.stage === 'in_assessment';
const branchesDone = (d: Detail) => d.akStatus === 'consistency_approved' && d.alScheduleStatus === 'approved';
const lastOffer = (d: Detail) => (d.offers ?? [])[(d.offers ?? []).length - 1];
const currentDocs = (d: Detail) => (d.documents ?? []).filter((x) => x.setVersion === d.documentSetVersion);
const hasDoc = (d: Detail, t: string) => currentDocs(d).some((x) => x.docType === t);
const hasMinutes = (d: Detail) => (d.documents ?? []).some((x) => x.docType === 'AL_MINUTES');
const hasObjection = (d: Detail) => (d.responses ?? []).some((r) => r.responseType === 'objection');
const leadResolved = (d: Detail) => (d.responses ?? []).some((r) => r.responderRole === 'lead_assessor');
const uppsResponded = (d: Detail) => (d.responses ?? []).some((r) => r.responderRole === 'upps');
const uppsAccepted = (d: Detail) => (d.responses ?? []).some((r) => r.responderRole === 'upps' && r.responseType === 'accept');
const rejectionPending = (d: Detail) => { const l = lastOffer(d); return l?.status === 'rejected' && !l.rejectionReviewedAt; };
export const isPaymentRejected = (d: Detail) => d.payments?.[0]?.status === 'rejected' && ['invoice_issued', 'payment_proof_uploaded'].includes(d.stage);

/** Indeks tahap berjalan (0..8); 9 berarti seluruh tahap selesai. */
export function currentIndex(d: Detail): number {
  switch (d.stage) {
    case 'draft': return 0;
    case 'submitted': case 'admin_revision': case 'admin_rejected': return 1;
    case 'admin_verified': case 'invoice_issued': case 'payment_proof_uploaded': return 2;
    case 'payment_verified': case 'in_assessment': return branchesDone(d) ? 4 : 3;
    case 'al_submitted': return 5;
    case 'responses_completed': return 6;
    case 'final_verified': return 7;
    case 'decided': return d.certificate ? 9 : 8;
    case 'released': return 9;
  }
}

type Raw = 'selesai' | 'aktif' | 'menunggu';
const step = (id: string, label: string, role: SubStep['role'], storage: StorageClass, raw: Raw, note?: string): SubStep => ({
  id, label, role, roleLabel: role === 'asesor_upps' ? 'Asesor dan UPPS' : roleName(role), storage, status: raw === 'menunggu' ? 'menunggu' : raw, note,
});
const lock = (steps: SubStep[], s: StepStatus): SubStep[] => steps.map((x) => ({ ...x, status: s }));

/* ---------------- Model alur ---------------- */
export function buildWorkflow(d: Detail): MainStage[] {
  const cur = currentIndex(d);
  const pay = d.payments?.[0];
  const rev = d.stage === 'admin_revision';
  const rej = d.stage === 'admin_rejected';
  const ak = d.akStatus;
  const al = d.alScheduleStatus;
  const last = lastOffer(d);

  const stage1: SubStep[] = [
    step('led', 'Unggah Laporan Evaluasi Diri (LED)', 'upps', 'A', hasDoc(d, 'LED') ? 'selesai' : 'aktif'),
    step('lkps', 'Unggah Laporan Kinerja Program Studi (LKPS)', 'upps', 'A', hasDoc(d, 'LKPS') ? 'selesai' : 'aktif'),
    step('kirim', 'Tinjau dan kirim pengajuan resmi', 'upps', 'C', hasDoc(d, 'LED') && hasDoc(d, 'LKPS') ? 'aktif' : 'menunggu'),
  ];
  const stage2: SubStep[] = [
    step('verifikasi', 'Verifikasi kelengkapan dokumen', 'sek_adm', 'C', d.stage === 'submitted' ? 'aktif' : rev || rej ? 'menunggu' : 'selesai'),
    ...(rev ? [step('perbaikan', 'Perbaikan dokumen oleh UPPS', 'upps', 'C', 'aktif', 'Sekretariat meminta perbaikan')] : []),
  ];
  const payRank = d.stage === 'admin_verified' ? 0 : d.stage === 'invoice_issued' ? 1 : d.stage === 'payment_proof_uploaded' ? 2 : 3;
  const proofStatus: Raw = payRank === 1 || isPaymentRejected(d) ? 'aktif' : payRank > 1 ? 'selesai' : 'menunggu';
  const stage3: SubStep[] = [
    step('tagihan', 'Terbitkan tagihan', 'sek_keu', 'A', payRank === 0 ? 'aktif' : 'selesai'),
    step('bukti', 'Unggah bukti pembayaran', 'upps', 'A', proofStatus, pay?.status === 'rejected' ? 'Bukti sebelumnya ditolak, unggah ulang' : undefined),
    step('verif-bayar', 'Verifikasi pembayaran', 'sek_keu', 'A', payRank === 2 && !isPaymentRejected(d) ? 'aktif' : payRank === 3 ? 'selesai' : 'menunggu'),
  ];
  const akOrderIdx = ['not_started', 'offered', 'offer_rejected', 'effective', 'ak_partial', 'ak_complete', 'consistency_returned', 'consistency_approved'].indexOf(ak);
  const laneAk: SubStep[] = [
    step('tawar', ak === 'offer_rejected' ? (rejectionPending(d) ? 'Tinjau penolakan penawaran' : 'Tawarkan ulang pasangan asesor') : 'Tawarkan pasangan asesor', 'kea', 'C',
      ak === 'not_started' || ak === 'offer_rejected' ? 'aktif' : 'selesai', ak === 'offer_rejected' && last?.rejectionReason ? `Alasan penolakan: ${last.rejectionReason}` : undefined),
    step('setuju', 'Asesor dan UPPS menerima penugasan', 'asesor_upps', 'C', ak === 'offered' ? 'aktif' : akOrderIdx > 2 ? 'selesai' : 'menunggu'),
    step('nilai-ak', 'Dua asesor menyerahkan penilaian AK', 'asesor', 'C', ['effective', 'ak_partial', 'consistency_returned'].includes(ak) ? 'aktif' : akOrderIdx >= 5 && ak !== 'consistency_returned' ? 'selesai' : 'menunggu', ak === 'consistency_returned' ? 'Dikembalikan KEA untuk dinilai ulang' : undefined),
    step('konsistensi', 'Periksa konsistensi hasil AK', 'kea', 'A', ak === 'ak_complete' ? 'aktif' : ak === 'consistency_approved' ? 'selesai' : 'menunggu'),
  ];
  const laneAl: SubStep[] = [
    step('usul', 'Usulkan jadwal Asesmen Lapangan', 'kea', 'A', al === 'not_started' || al === 'rejected' ? 'aktif' : 'selesai', al === 'rejected' ? 'Usulan sebelumnya ditolak, usulkan ulang' : undefined),
    step('setuju-jadwal', 'Setujui jadwal Asesmen Lapangan', 'sek_adm', 'A', al === 'proposed' ? 'aktif' : al === 'approved' ? 'selesai' : 'menunggu'),
  ];
  const stage5: SubStep[] = [
    step('minutes', 'Unggah Berita Acara Asesmen Lapangan', 'asesor', 'A', hasMinutes(d) ? 'selesai' : 'aktif'),
    step('nilai-al', 'Isi dan serahkan penilaian Asesmen Lapangan', 'asesor', 'C', hasMinutes(d) ? 'aktif' : 'menunggu'),
  ];
  const stage6: SubStep[] = [
    step('tanggap-upps', 'UPPS menyampaikan tanggapan atas hasil', 'upps', 'A', uppsAccepted(d) || (uppsResponded(d) && leadResolved(d)) ? 'selesai' : uppsResponded(d) ? 'selesai' : 'aktif'),
    step('tanggap-lead', 'Ketua asesor menanggapi keberatan (bila ada)', 'asesor', 'A', hasObjection(d) ? (leadResolved(d) ? 'selesai' : 'aktif') : 'menunggu', hasObjection(d) ? undefined : 'Hanya bila UPPS mengajukan keberatan'),
  ];

  const mk = (i: number, id: string, label: string, short: string, roleLabel: string, storage: StorageClass, steps: SubStep[], extra: Partial<MainStage> = {}): MainStage => {
    let status: StepStatus = i < cur ? 'selesai' : i === cur ? 'aktif' : 'terkunci';
    if (i === 1 && rev) status = 'menunggu';
    if (i === 1 && rej) status = 'ditolak';
    if (rej && i > 1) status = 'terkunci';
    const sub = status === 'terkunci' ? lock(steps, 'terkunci') : status === 'selesai' ? lock(steps, 'selesai') : steps;
    const lanes = extra.lanes && (status === 'terkunci' ? { ak: lock(extra.lanes.ak, 'terkunci'), al: lock(extra.lanes.al, 'terkunci') } : status === 'selesai' ? { ak: lock(extra.lanes.ak, 'selesai'), al: lock(extra.lanes.al, 'selesai') } : extra.lanes);
    return { no: i + 1, id, label, short, roleLabel, storage, status, parallel: !!lanes, steps: sub, ...extra, lanes };
  };

  return [
    mk(0, 'pengajuan', 'Pengajuan', 'Pengajuan', 'UPPS', 'C', stage1),
    mk(1, 'verifikasi', 'Verifikasi kelengkapan', 'Verifikasi', 'Sekretariat Administrasi', 'C', stage2),
    mk(2, 'pembayaran', 'Tagihan dan pembayaran', 'Pembayaran', 'Sekretariat Keuangan dan UPPS', 'A', stage3),
    mk(3, 'paralel', 'Penugasan asesor dan Asesmen Kecukupan, serta Jadwal Asesmen Lapangan', 'Asesmen Kecukupan dan Jadwal', 'KEA, Asesor, UPPS, Sekretariat', 'C', [...laneAk, ...laneAl], { lanes: { ak: laneAk, al: laneAl } }),
    mk(4, 'al', 'Asesmen Lapangan', 'Asesmen Lapangan', 'Ketua asesor', 'C', stage5),
    mk(5, 'tanggapan', 'Tanggapan atas hasil asesmen', 'Tanggapan', 'UPPS dan Ketua asesor', 'A', stage6),
    mk(6, 'verifikasi-akhir', 'Verifikasi akhir', 'Verifikasi akhir', 'KEA', 'C', [step('final', 'Periksa seluruh hasil dan catat verifikasi akhir', 'kea', 'C', 'aktif')]),
    mk(7, 'penetapan', 'Penetapan peringkat', 'Penetapan', 'Majelis Akreditasi', 'C', [step('tetapkan', 'Tetapkan peringkat dan nomor Surat Keputusan', 'majelis', 'C', 'aktif')]),
    mk(8, 'penerbitan', 'Penerbitan hasil', 'Penerbitan', 'Sekretariat Administrasi', 'A', [step('terbit', 'Terbitkan sertifikat hasil akreditasi', 'sek_adm', 'A', 'aktif')]),
  ];
}

export const stageStatus = (d: Detail, no: number): StepStatus => buildWorkflow(d)[no - 1]!.status;

/* ---------------- Tindakan berikutnya ---------------- */
export type ActionKey =
  | 'compose_submission' | 'upload_proof' | 'respond_offer_upps' | 'upps_response'
  | 'admin_verify' | 'decide_schedule' | 'issue_certificate'
  | 'issue_invoice' | 'verify_payment'
  | 'offer' | 'review_rejection' | 'reoffer' | 'consistency' | 'propose_schedule' | 'final_verify'
  | 'respond_offer' | 'ak_scoring' | 'ak_correction' | 'al_assessment' | 'lead_response'
  | 'decision';

export interface NextAction {
  key: ActionKey;
  role: AppRole;
  title: string;
  why: string;
  button: string;
  wait: string; // frasa untuk pihak lain: "memverifikasi ..."
  storage: StorageClass;
  /** Tujuan tautan langsung dari antrean (selain halaman detail). */
  to?: (id: string) => string;
}
const A = (key: ActionKey, role: AppRole, title: string, button: string, wait: string, storage: StorageClass, why: string, to?: NextAction['to']): NextAction => ({ key, role, title, button, wait, storage, why, to });

const WHY_C = 'Tindakan ini dicatat permanen dan tidak dapat dihapus; koreksi hanya dapat dilakukan melalui catatan baru yang disertai alasan.';
const WHY_A = 'Tindakan ini tersimpan di sistem dan jejak auditnya dicatat permanen.';

/** Tugas suatu peran pada pengajuan. `uid` mengikat tugas asesor ke pengguna tertentu; tanpa `uid` dianggap peran secara umum. */
export function dutiesFor(d: Detail, role: AppRole, uid?: string): NextAction[] {
  const out: NextAction[] = [];
  const last = lastOffer(d);
  const offers = d.offers ?? [];
  switch (role) {
    case 'upps': {
      if (d.stage === 'draft') out.push(A('compose_submission', 'upps', 'Lengkapi dokumen dan kirim pengajuan', 'Lengkapi pengajuan', 'melengkapi dan mengirim pengajuan', 'C', `Unggah LED dan LKPS, lalu kirim pengajuan resmi. ${WHY_C}`));
      if (d.stage === 'admin_revision') out.push(A('compose_submission', 'upps', 'Perbaiki dokumen sesuai catatan Sekretariat', 'Perbaiki dokumen', 'memperbaiki dokumen', 'C', `Sekretariat meminta perbaikan. Unggah dokumen yang telah diperbaiki, lalu kirim ulang. ${WHY_C}`));
      if (d.stage === 'invoice_issued' || isPaymentRejected(d)) out.push(A('upload_proof', 'upps', 'Unggah bukti pembayaran', 'Unggah bukti pembayaran', 'mengunggah bukti pembayaran', 'A', `Tagihan telah terbit. Unggah bukti pembayaran agar Sekretariat Keuangan dapat memverifikasinya. ${WHY_A}`));
      const o = [...offers].reverse().find((x) => x.status === 'offered');
      if (o && !o.uppsResponse) out.push(A('respond_offer_upps', 'upps', 'Tanggapi penawaran pasangan asesor', 'Tanggapi penawaran', 'menanggapi penawaran asesor', 'C', `KEA mengusulkan pasangan asesor. Penugasan berlaku bila kedua asesor dan UPPS menerima. ${WHY_C}`));
      if (d.stage === 'al_submitted' && !uppsAccepted(d) && (!uppsResponded(d) || leadResolved(d)))
        out.push(A('upps_response', 'upps', 'Sampaikan tanggapan atas hasil Asesmen Lapangan', 'Sampaikan tanggapan', 'menyampaikan tanggapan atas hasil asesmen', 'A', `Bapak/Ibu dapat menerima hasil atau mengajukan keberatan beserta uraiannya. ${WHY_A}`));
      break;
    }
    case 'sek_adm': {
      if (d.stage === 'submitted') out.push(A('admin_verify', 'sek_adm', 'Verifikasi kelengkapan dokumen', 'Verifikasi kelengkapan', 'memverifikasi kelengkapan dokumen', 'C', `Periksa LED dan LKPS, lalu catat hasilnya. ${WHY_C}`));
      if (d.alSchedules ? d.alSchedules.some((x) => x.status === 'proposed') : d.alScheduleStatus === 'proposed')
        out.push(A('decide_schedule', 'sek_adm', 'Putuskan usulan jadwal Asesmen Lapangan', 'Putuskan jadwal', 'menyetujui jadwal Asesmen Lapangan', 'A', `KEA telah mengusulkan jadwal. Setujui atau tolak disertai catatan. ${WHY_A}`));
      if (d.stage === 'decided' && !d.certificate) out.push(A('issue_certificate', 'sek_adm', 'Terbitkan sertifikat hasil akreditasi', 'Terbitkan sertifikat', 'menerbitkan sertifikat', 'A', `Peringkat telah ditetapkan Majelis. Terbitkan sertifikat dalam bentuk PDF. ${WHY_A}`));
      break;
    }
    case 'sek_keu': {
      if (d.stage === 'admin_verified') out.push(A('issue_invoice', 'sek_keu', 'Terbitkan tagihan', 'Terbitkan tagihan', 'menerbitkan tagihan', 'A', `Dokumen telah dinyatakan lengkap. Tetapkan jumlah tagihan bagi UPPS. ${WHY_A}`));
      if (d.stage === 'payment_proof_uploaded') out.push(A('verify_payment', 'sek_keu', 'Verifikasi bukti pembayaran', 'Verifikasi pembayaran', 'memverifikasi pembayaran', 'A', `UPPS telah mengunggah bukti pembayaran. Periksa dan catat hasilnya. ${WHY_A}`));
      break;
    }
    case 'kea': {
      if (inBranch(d)) {
        if (d.akStatus === 'not_started') out.push(A('offer', 'kea', 'Tawarkan pasangan asesor', 'Tawarkan asesor', 'menawarkan pasangan asesor', 'C', `Pilih dua asesor dan tetapkan ketua asesor. ${WHY_C}`));
        if (d.akStatus === 'offer_rejected' && rejectionPending(d)) out.push(A('review_rejection', 'kea', 'Tinjau penolakan penawaran asesor', 'Tinjau penolakan', 'meninjau penolakan penawaran', 'A', `Penawaran ditolak. Catat tinjauan sebelum menawarkan pasangan lain. ${WHY_A}`));
        if (d.akStatus === 'offer_rejected' && !rejectionPending(d)) out.push(A('reoffer', 'kea', 'Tawarkan ulang pasangan asesor', 'Tawarkan ulang', 'menawarkan ulang pasangan asesor', 'C', `Tinjauan telah dicatat. Pilih pasangan asesor yang baru. ${WHY_C}`));
        if (d.akStatus === 'ak_complete') out.push(A('consistency', 'kea', 'Periksa konsistensi hasil Asesmen Kecukupan', 'Periksa konsistensi', 'memeriksa konsistensi hasil AK', 'A', `Kedua asesor telah menyerahkan penilaian. Setujui atau kembalikan untuk dinilai ulang. ${WHY_A}`));
        if (d.alScheduleStatus === 'not_started' || d.alScheduleStatus === 'rejected') out.push(A('propose_schedule', 'kea', d.alScheduleStatus === 'rejected' ? 'Usulkan ulang jadwal Asesmen Lapangan' : 'Usulkan jadwal Asesmen Lapangan', 'Usulkan jadwal', 'mengusulkan jadwal Asesmen Lapangan', 'A', `Tentukan tanggal, lokasi, dan moda pelaksanaan. ${WHY_A}`));
      }
      if (d.stage === 'responses_completed') out.push(A('final_verify', 'kea', 'Catat verifikasi akhir', 'Verifikasi akhir', 'mencatat verifikasi akhir', 'C', `Tanggapan UPPS telah selesai. Periksa hasil AL dan kedua hasil AK, lalu catat verifikasi akhir. ${WHY_C}`));
      break;
    }
    case 'asesor': {
      const mine = (id?: string) => uid === undefined || id === uid;
      const inPair = !!last && (uid === undefined || [last.assessor1Id, last.assessor2Id].includes(uid));
      const isLead = !!last && mine(last.leadAssessorId);
      const myResp = last ? (uid === undefined ? (last.assessor1Response && last.assessor2Response ? 'ok' : null) : last.assessor1Id === uid ? last.assessor1Response : last.assessor2Response) : null;
      const myAk = (d.assessments ?? []).find((a) => a.phase === 'AK' && (uid === undefined || a.assessorId === uid));
      const akSubmittedCount = (d.assessments ?? []).filter((a) => a.phase === 'AK' && a.status === 'submitted').length;
      const akOpen = uid === undefined ? akSubmittedCount < 2 : myAk?.status !== 'submitted';
      if (inPair && last?.status === 'offered' && !myResp) out.push(A('respond_offer', 'asesor', 'Tanggapi penawaran penugasan', 'Tanggapi penugasan', 'menanggapi penawaran penugasan', 'C', `KEA menugaskan Bapak/Ibu sebagai asesor. Terima atau tolak disertai alasan. ${WHY_C}`));
      if (inPair && ['effective', 'ak_partial', 'consistency_returned'].includes(d.akStatus)) {
        if (akOpen) out.push(A('ak_scoring', 'asesor', d.akStatus === 'consistency_returned' ? 'Nilai ulang Asesmen Kecukupan' : 'Isi penilaian Asesmen Kecukupan', myAk ? 'Lanjutkan penilaian' : 'Mulai penilaian', 'menyerahkan penilaian Asesmen Kecukupan', 'C', `Isi skor setiap butir pada sembilan kriteria, lalu serahkan hasil. ${WHY_C}`, (id) => `/asesor/pengajuan/${id}/penilaian/AK`));
        else if (d.akStatus === 'consistency_returned') out.push(A('ak_correction', 'asesor', 'Perbaiki hasil Asesmen Kecukupan melalui koreksi', 'Buka catatan resmi', 'memperbaiki hasil AK', 'C', `KEA mengembalikan hasil. Koreksi dilakukan pada Catatan resmi dengan menyebutkan alasan. ${WHY_C}`));
      }
      if (isLead && inBranch(d) && branchesDone(d)) out.push(A('al_assessment', 'asesor', 'Laksanakan Asesmen Lapangan: unggah berita acara dan serahkan penilaian', 'Buka langkah asesmen lapangan', 'menyerahkan hasil Asesmen Lapangan', 'C', `Unggah berita acara terlebih dahulu, kemudian isi dan serahkan penilaian. ${WHY_C}`));
      if (isLead && hasObjection(d) && !leadResolved(d)) out.push(A('lead_response', 'asesor', 'Tanggapi keberatan UPPS', 'Tanggapi keberatan', 'menanggapi keberatan UPPS', 'A', `UPPS mengajukan keberatan atas hasil asesmen. Sampaikan respons ketua asesor. ${WHY_A}`));
      break;
    }
    case 'majelis': {
      if (d.stage === 'final_verified') out.push(A('decision', 'majelis', 'Tetapkan peringkat akreditasi', 'Tetapkan peringkat', 'menetapkan peringkat akreditasi', 'C', `Verifikasi akhir telah selesai. Tetapkan peringkat, nomor Surat Keputusan, dan masa berlaku. ${WHY_C}`));
      break;
    }
  }
  return out;
}

const ROLES: AppRole[] = ['upps', 'sek_adm', 'sek_keu', 'kea', 'asesor', 'majelis'];
/** Peran yang saat ini memegang pengajuan. */
export function holders(d: Detail): AppRole[] {
  return ROLES.filter((r) => dutiesFor(d, r).length > 0);
}
export const holderLabel = (d: Detail): string => {
  if (d.stage === 'released') return 'Proses selesai';
  if (d.stage === 'admin_rejected') return 'Proses dihentikan';
  const h = holders(d);
  return h.length ? h.map((r) => roleName(r)).join(' dan ') : 'Menunggu pembaruan sistem';
};

export interface NextResult {
  actions: NextAction[];
  /** Pesan netral bila pengguna tidak memiliki tugas. */
  waiting: string | null;
  holders: AppRole[];
  finished: boolean;
}
/**
 * Tindakan on-chain yang prasyaratnya dibuktikan oleh jejak audit (gating chaincode).
 * Selama bukti belum tercatat permanen, tindakan ditahan agar pengguna tidak menerima galat.
 */
const AUDIT_GATES: Record<string, { kinds: string[]; label: string }> = {
  offer: { kinds: ['PaymentVerified'], label: 'verifikasi pembayaran' },
  reoffer: { kinds: ['AssignmentRejectionReviewed'], label: 'tinjauan penolakan penawaran' },
  al_assessment: { kinds: ['AKConsistencyApproved', 'ALScheduleApproved'], label: 'persetujuan konsistensi AK dan jadwal Asesmen Lapangan' },
  final_verify: { kinds: ['ResponsesCompleted'], label: 'penyelesaian tanggapan' },
};
function auditCommitted(d: Detail, kind: string): boolean {
  return (d.audit ?? []).some((e) => e.kind === kind && e.status === 'committed');
}

export function nextActions(d: Detail, user: Pick<User, 'id' | 'role'>): NextResult {
  const pendingGates: string[] = [];
  const actions = dutiesFor(d, user.role, user.id).filter((a) => {
    const gate = AUDIT_GATES[a.key];
    if (!gate || gate.kinds.every((k) => auditCommitted(d, k))) return true;
    pendingGates.push(gate.label);
    return false;
  });
  const h = holders(d);
  const finished = d.stage === 'released' || d.stage === 'admin_rejected';
  let waiting: string | null = null;
  if (!actions.length && pendingGates.length) {
    waiting = `Bukti ${pendingGates.join(' serta ')} sedang dicatat permanen. Langkah Bapak/Ibu akan tersedia otomatis dalam beberapa detik.`;
  } else if (!actions.length) {
    if (d.stage === 'released') waiting = 'Seluruh proses akreditasi telah selesai. Tidak ada langkah lanjutan.';
    else if (d.stage === 'admin_rejected') waiting = 'Pengajuan ditolak pada verifikasi administrasi. Tidak ada langkah lanjutan pada pengajuan ini.';
    else {
      const other = ROLES.flatMap((r) => dutiesFor(d, r)).filter((a) => a.role !== user.role);
      waiting = other.length
        ? `Menunggu ${[...new Set(other.map((a) => `${roleName(a.role)} ${a.wait}`))].join('; serta ')}.`
        : d.stage === 'decided' ? 'Menunggu Sekretariat Administrasi menerbitkan sertifikat.' : 'Pengajuan sedang diproses sistem. Halaman akan diperbarui otomatis.';
    }
  }
  return { actions, waiting, holders: h, finished };
}

/* ---------------- Bukti per tahap ---------------- */
export interface Evidence { key: string; title: string; when?: string | null; roleLabel?: string; kind: 'chain' | 'audit'; txId?: string | null; block?: string | number | null; version?: number }

const STAGE_RECORDS: Record<number, (r: FormalRecordView) => boolean> = {
  0: (r) => r.recordType === 'SUBMISSION',
  1: (r) => r.recordType === 'ADMIN_VERIFICATION',
  3: (r) => r.recordType === 'ASSESSOR_OFFER' || r.recordType === 'ASSIGNMENT_RESPONSE' || (r.recordType === 'ASSESSMENT_RESULT' && r.payload?.phase === 'AK'),
  4: (r) => r.recordType === 'ASSESSMENT_RESULT' && r.payload?.phase === 'AL',
  6: (r) => r.recordType === 'FINAL_VERIFICATION',
  7: (r) => r.recordType === 'DECISION',
};
const STAGE_AUDIT: Record<number, string[]> = {
  0: ['DocumentVersionSaved'],
  2: ['InvoiceIssued', 'PaymentProofUploaded', 'PaymentVerified', 'PaymentRejected'],
  3: ['AssignmentRejectionReviewed', 'AKConsistencyApproved', 'AKConsistencyReturned', 'ALScheduleProposed', 'ALScheduleApproved', 'ALScheduleRejected'],
  5: ['UPPSResponseSubmitted', 'LeadAssessorResponseSubmitted', 'ResponsesCompleted'],
  8: ['CertificateIssued'],
};
export const recordTime = (r: FormalRecordView) => r.committedAt ?? r.timestamp ?? r.createdAt ?? null;

export function stageEvidence(d: Detail, idx: number, audit: AuditEventView[] = d.audit ?? []): Evidence[] {
  const out: Evidence[] = [];
  const rf = STAGE_RECORDS[idx];
  if (rf) for (const r of d.records ?? []) if (rf(r)) out.push({ key: r.id, title: `${RECORD_LABEL[r.recordType] ?? r.recordType}${r.version > 1 ? ` (versi ${r.version})` : ''}`, when: recordTime(r), roleLabel: roleName(r.actorRole as string), kind: 'chain', txId: r.txId, block: r.blockNumber, version: r.version });
  const kinds = STAGE_AUDIT[idx];
  if (kinds) for (const e of audit) if (kinds.includes(e.kind)) out.push({ key: e.eventId, title: AUDIT_KIND_LABEL[e.kind] ?? e.kind, when: e.occurredAt, roleLabel: roleName(e.actorRole), kind: 'audit', txId: e.status === 'committed' ? e.txId : null, block: e.blockNumber });
  return out.sort((a, b) => String(a.when ?? '').localeCompare(String(b.when ?? '')));
}
