import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_LABEL, type AppRole } from '@akreditasi/shared';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, EmptyState, FormError, PageHeader, Spinner, Table, Td, cx } from '../components/ui';
import { useSubmissions } from '../features/common/queries';
import { AK_LABEL, AL_LABEL, StageBadge, fmtDate } from '../features/common/labels';
import type { SubmissionSummary } from '../api/types';
import { errorMessage } from '../api/client';

interface Group { key: string; label: string; filter: (s: SubmissionSummary) => boolean; hint: string }
const ALL: Group = { key: 'all', label: 'Semua', filter: () => true, hint: 'Seluruh pengajuan yang dapat Anda akses.' };
const GROUPS: Record<AppRole, Group[]> = {
  upps: [ALL, { key: 'act', label: 'Perlu tindakan saya', hint: 'Draf, revisi, pembayaran, atau tanggapan.', filter: (s) => ['draft', 'admin_revision', 'invoice_issued', 'al_submitted'].includes(s.stage) || s.akStatus === 'offered' }],
  sek_adm: [
    { key: 'ver', label: 'Verifikasi administrasi', hint: 'Pengajuan berstatus diajukan.', filter: (s) => s.stage === 'submitted' },
    { key: 'sch', label: 'Persetujuan jadwal AL', hint: 'Usulan jadwal menunggu keputusan.', filter: (s) => s.alScheduleStatus === 'proposed' },
    { key: 'cer', label: 'Penerbitan sertifikat', hint: 'Keputusan sudah ditetapkan.', filter: (s) => s.stage === 'decided' },
    ALL,
  ],
  sek_keu: [
    { key: 'inv', label: 'Terbitkan tagihan', hint: 'Administrasi terverifikasi.', filter: (s) => s.stage === 'admin_verified' },
    { key: 'pay', label: 'Verifikasi pembayaran', hint: 'Bukti bayar telah diunggah.', filter: (s) => s.stage === 'payment_proof_uploaded' },
    ALL,
  ],
  kea: [
    { key: 'off', label: 'Penawaran asesor', hint: 'Pembayaran terverifikasi / penawaran ditolak.', filter: (s) => s.akStatus === 'not_started' && ['payment_verified', 'in_assessment'].includes(s.stage) || s.akStatus === 'offer_rejected' },
    { key: 'con', label: 'Konsistensi AK', hint: 'Kedua hasil AK telah masuk.', filter: (s) => s.akStatus === 'ak_complete' },
    { key: 'sch', label: 'Jadwal AL', hint: 'Usulkan atau usulkan ulang jadwal.', filter: (s) => ['payment_verified', 'in_assessment'].includes(s.stage) && ['not_started', 'rejected'].includes(s.alScheduleStatus) },
    { key: 'fin', label: 'Verifikasi akhir', hint: 'Tanggapan telah selesai.', filter: (s) => s.stage === 'responses_completed' },
    ALL,
  ],
  asesor: [ALL],
  majelis: [{ key: 'q', label: 'Antrean penetapan', hint: 'Verifikasi akhir selesai.', filter: (s) => s.stage === 'final_verified' }, ALL],
};

export function DashboardPage() {
  const { user } = useAuth();
  const q = useSubmissions();
  const [tab, setTab] = useState(0);
  if (!user) return null;
  const groups = GROUPS[user.role];
  const g = groups[Math.min(tab, groups.length - 1)]!;
  const rows = (q.data ?? []).filter(g.filter);
  return (
    <div>
      <PageHeader title={user.role === 'upps' ? 'Pengajuan Saya' : `Dasbor ${ROLE_LABEL[user.role]}`} subtitle={g.hint}
        actions={user.role === 'upps' ? <Link to="/upps/baru"><Button>Pengajuan baru</Button></Link> : undefined} />
      {groups.length > 1 && (
        <div role="tablist" className="mb-3 flex gap-1 overflow-x-auto">
          {groups.map((x, i) => {
            const n = (q.data ?? []).filter(x.filter).length;
            return <button key={x.key} role="tab" aria-selected={i === tab} onClick={() => setTab(i)}
              className={cx('whitespace-nowrap rounded-full px-3 py-1.5 text-sm', i === tab ? 'bg-navy-900 text-white' : 'bg-white text-navy-800 ring-1 ring-slate-200 hover:bg-navy-50')}>{x.label} <span className="opacity-70">({n})</span></button>;
          })}
        </div>
      )}
      {q.isLoading && <Spinner />}
      {q.isError && <FormError message={errorMessage(q.error)} />}
      {q.data && !rows.length && <EmptyState title="Tidak ada pengajuan pada daftar ini">{user.role === 'upps' ? 'Buat pengajuan baru untuk memulai.' : 'Antrean kosong.'}</EmptyState>}
      {rows.length > 0 && (
        <Table caption="Daftar pengajuan" head={['Program studi', 'Tahap', 'AK', 'Jadwal AL', 'Diperbarui', '']}>
          {rows.map((s) => (
            <tr key={s.id}>
              <Td><div className="font-medium text-navy-900">{s.programName ?? s.id.slice(0, 8)}</div><div className="text-xs text-slate-500">{s.institutionName}</div></Td>
              <Td><StageBadge stage={s.stage} /></Td>
              <Td><Badge>{AK_LABEL[s.akStatus]}</Badge></Td>
              <Td><Badge>{AL_LABEL[s.alScheduleStatus]}</Badge></Td>
              <Td>{fmtDate(s.updatedAt)}</Td>
              <Td><Link className="font-medium text-navy-700 underline" to={`/pengajuan/${s.id}`}>Buka</Link></Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
