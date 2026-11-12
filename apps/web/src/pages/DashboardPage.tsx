import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardList, Hourglass, Inbox, Plus, Search, UserCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, DataTable, EmptyState, FormError, Input, Kpi, PageHeader, Select, Skeleton, Tabs } from '../components/ui';
import { useTaskQueue, type TaskItem } from '../features/common/useTasks';
import { StagePill } from '../features/common/StagePill';
import { errorMessage } from '../api/client';
import { usePendingRegistrationCount } from '../features/sekretariat/uppsRegistrations';
import { fmtDateTime, fmtNumber, ROLE_NAME } from '../lib/labels';
import { currentIndex, holderLabel } from '../lib/workflow';
import type { SubmissionSummary } from '../api/types';
import type { AppRole } from '@akreditasi/shared';

const TITLE: Record<AppRole, string> = {
  upps: 'Pengajuan Saya', sek_adm: 'Antrean Administrasi', sek_keu: 'Tagihan dan Pembayaran', kea: 'Antrean Komite Evaluasi dan Akreditasi', asesor: 'Penugasan Saya', majelis: 'Penetapan Peringkat',
};
const STAGE_FILTERS = [
  { v: '', label: 'Semua tahap' }, { v: '0', label: 'Tahap 1. Pengajuan' }, { v: '1', label: 'Tahap 2. Verifikasi kelengkapan' }, { v: '2', label: 'Tahap 3. Tagihan dan pembayaran' },
  { v: '3', label: 'Tahap 4. Penugasan, AK, dan jadwal AL' }, { v: '4', label: 'Tahap 5. Asesmen Lapangan' }, { v: '5', label: 'Tahap 6. Tanggapan' },
  { v: '6', label: 'Tahap 7. Verifikasi akhir' }, { v: '7', label: 'Tahap 8. Penetapan' }, { v: '8', label: 'Tahap 9. Penerbitan' }, { v: '9', label: 'Selesai' },
];

function TaskRow({ t }: { t: TaskItem }) {
  const s = t.submission;
  const to = t.action.to?.(s.id) ?? `/pengajuan/${s.id}`;
  return (
    <li className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700"><ClipboardList size={22} aria-hidden /></span>
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-display text-base font-semibold text-navy-900">{t.action.title}</p>
        <p className="text-base text-ink">{s.programName ?? 'Program studi'}{s.programLevel ? ` (${s.programLevel})` : ''}</p>
        <p className="text-sm text-muted">{s.institutionName}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2"><StagePill stage={s.stage} /><span className="text-sm text-faint">Diperbarui {fmtDateTime(s.updatedAt)}</span></div>
      </div>
      <Link to={to} className="w-full sm:w-auto"><Button className="w-full" icon={<ArrowRight size={16} />}>{t.action.button}</Button></Link>
    </li>
  );
}

const progress = (s: SubmissionSummary) => { const i = currentIndex(s); return i >= 9 ? 'Selesai' : `Tahap ${i + 1} dari 9`; };

export function DashboardPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const { rows, tasks, counts, loading, query } = useTaskQueue();
  const pendingRegs = usePendingRegistrationCount(user?.role === 'sek_adm');
  const [tab, setTab] = useState<'queue' | 'all'>('queue');
  const [stage, setStage] = useState('');
  const [text, setText] = useState(params.get('q') ?? '');
  useEffect(() => { const q = params.get('q'); if (q !== null) { setText(q); setTab('all'); } }, [params]);
  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase();
    return rows.filter((s) => (stage === '' || String(currentIndex(s)) === stage) && (!t || `${s.programName ?? ''} ${s.institutionName ?? ''} ${s.id}`.toLowerCase().includes(t)));
  }, [rows, stage, text]);
  if (!user) return null;
  const kpi = loading && !rows.length;
  return (
    <div>
      <PageHeader title={TITLE[user.role]} eyebrow={ROLE_NAME[user.role]}
        subtitle={counts.action ? `Terdapat ${counts.action} pengajuan yang menunggu tindakan Bapak/Ibu. Mulailah dari daftar tugas di bawah.` : 'Tidak ada tugas yang menunggu Bapak/Ibu saat ini. Perubahan status akan tampil otomatis.'}
        actions={user.role === 'upps' ? <Link to="/upps/baru"><Button icon={<Plus size={16} />}>Ajukan akreditasi baru</Button></Link> : undefined} />
      {user.role === 'sek_adm' && (
        <Link to="/sekretariat/administrasi/akun-upps" className="card mb-6 flex flex-wrap items-center gap-4 p-4 hover:bg-navy-50/60 sm:p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700"><UserCheck size={22} aria-hidden /></span>
          <div className="min-w-0 flex-1 basis-64"><p className="font-display text-base font-semibold text-navy-900">Verifikasi akun UPPS</p><p className="text-base text-muted">{pendingRegs ? `${pendingRegs} pendaftaran UPPS menunggu verifikasi Bapak/Ibu.` : 'Tidak ada pendaftaran UPPS yang menunggu verifikasi.'}</p></div>
          <Button variant={pendingRegs ? 'primary' : 'secondary'} icon={<ArrowRight size={16} />}>{pendingRegs ? 'Periksa pendaftaran' : 'Buka daftar pendaftaran'}</Button>
        </Link>
      )}
      {query.isError && <div className="mb-4"><FormError message={errorMessage(query.error)} /></div>}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {kpi ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px]" />) : <>
          <Kpi tone="primary" label="Perlu tindakan Anda" value={counts.action} hint="Menunggu Bapak/Ibu" icon={<Inbox size={22} />} />
          <Kpi label="Sedang berjalan" value={counts.running} hint="Ditangani pihak lain" icon={<Hourglass size={22} />} />
          <Kpi tone="success" label="Selesai" value={counts.done} hint="Hasil diterbitkan atau dihentikan" icon={<CheckCircle2 size={22} />} />
        </>}
      </div>
      <Tabs label="Daftar pengajuan" value={tab} onChange={setTab} tabs={[{ id: 'queue', label: 'Antrean tugas Anda', count: tasks.length }, { id: 'all', label: 'Semua pengajuan', count: rows.length }]} />
      <div className="mt-5" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {loading && !rows.length && <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
        {tab === 'queue' && !loading && (tasks.length ? (
          <ul className="card divide-y divide-line">{tasks.map((t) => <TaskRow key={`${t.submission.id}-${t.action.key}`} t={t} />)}</ul>
        ) : (
          <EmptyState icon={<CheckCircle2 size={22} />} title="Tidak ada tugas saat ini" action={user.role === 'upps' ? <Link to="/upps/baru"><Button>Ajukan akreditasi baru</Button></Link> : undefined}>Seluruh tugas Bapak/Ibu telah selesai. Daftar akan terisi otomatis bila ada pengajuan yang memerlukan tindakan.</EmptyState>
        ))}
        {tab === 'all' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <label className="relative min-w-[16rem] flex-1"><span className="sr-only">Cari pengajuan</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden /><Input className="pl-9" placeholder="Cari program studi, institusi, atau nomor" value={text} onChange={(e) => setText(e.target.value)} /></label>
              <label className="min-w-[14rem]"><span className="sr-only">Saring menurut tahap</span><Select value={stage} onChange={(e) => setStage(e.target.value)}>{STAGE_FILTERS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</Select></label>
            </div>
            {filtered.length ? (
              <DataTable rows={filtered} rowKey={(s) => s.id} caption="Semua pengajuan"
                columns={[
                  { key: 'p', header: 'Program studi', primary: true, cell: (s) => <div><div className="font-medium text-ink">{s.programName ?? s.id.slice(0, 8)}{s.programLevel ? ` (${s.programLevel})` : ''}</div><div className="text-sm text-muted">{s.institutionName}</div></div> },
                  { key: 't', header: 'Posisi', cell: (s) => <div className="space-y-1"><StagePill stage={s.stage} /><div className="text-sm text-muted">{progress(s)}</div></div> },
                  { key: 'h', header: 'Sedang ditangani', cell: (s) => <Badge tone="neutral">{holderLabel(s)}</Badge> },
                  ...(filtered.some((x) => x.aiScore) ? [{ key: 'ai', header: 'Skor AI sementara', align: 'right' as const, cell: (x: SubmissionSummary) => x.aiScore ? <div title="Hasil analisis AI (pendukung, bukan nilai resmi)"><b className="tabular-nums">{fmtNumber(x.aiScore.totals.total)}</b><div className="text-xs text-muted">pendukung, bukan nilai resmi</div></div> : <span className="text-faint">—</span> }] : []),
                  { key: 'u', header: 'Diperbarui', cell: (s) => fmtDateTime(s.updatedAt) },
                  { key: 'o', header: '', cell: (s) => <Link to={`/pengajuan/${s.id}`}><Button variant="secondary" size="sm" icon={<ArrowRight size={15} />}>Buka</Button></Link> },
                ]} />
            ) : <EmptyState icon={<Search size={22} />} title="Tidak ada pengajuan yang sesuai">Ubah kata kunci atau pilih &quot;Semua tahap&quot;.</EmptyState>}
          </div>
        )}
      </div>
    </div>
  );
}

