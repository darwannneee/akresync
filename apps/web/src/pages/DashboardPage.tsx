import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardList, Hourglass, Inbox, Plus, UserCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, DataTable, EmptyState, FormError, Notice, PageHeader, Select, Skeleton, StatWidget } from '../components/ui';
import { useTaskQueue } from '../features/common/useTasks';
import { StagePill } from '../features/common/StagePill';
import { errorMessage } from '../api/client';
import { usePendingRegistrationCount } from '../features/sekretariat/uppsRegistrations';
import { fmtDateTime, fmtNumber } from '../lib/labels';
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

const progress = (s: SubmissionSummary) => { const i = currentIndex(s); return i >= 9 ? 'Selesai' : `Tahap ${i + 1} dari 9`; };

export function DashboardPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const { rows, tasks, counts, loading, query } = useTaskQueue();
  const pendingRegs = usePendingRegistrationCount(user?.role === 'sek_adm');
  const [stage, setStage] = useState('');
  const [text, setText] = useState(params.get('q') ?? '');
  useEffect(() => { const q = params.get('q'); if (q !== null) setText(q); }, [params]);
  const filtered = useMemo(() => rows.filter((s) => stage === '' || String(currentIndex(s)) === stage), [rows, stage]);
  if (!user) return null;
  const kpi = loading && !rows.length;
  const detail = (s: SubmissionSummary) => `/pengajuan/${s.id}`;
  const prog = (s: SubmissionSummary) => <div><div className="font-medium text-ink">{s.programName ?? s.id.slice(0, 8)}{s.programLevel ? ` (${s.programLevel})` : ''}</div><div className="text-muted">{s.institutionName}</div></div>;
  return (
    <div>
      <PageHeader title={TITLE[user.role]} crumbs={[{ label: 'Dasbor' }]}
        actions={user.role === 'upps' ? <Link to="/upps/baru"><Button icon={<Plus size={15} />}>Ajukan Akreditasi Baru</Button></Link> : undefined} />
      {query.isError && <div className="mb-4"><FormError message={errorMessage(query.error)} /></div>}
      {user.role === 'sek_adm' && (
        <Notice tone={pendingRegs ? 'warn' : 'info'} className="mb-4">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{pendingRegs ? `${pendingRegs} pendaftaran akun UPPS menunggu verifikasi Bapak/Ibu.` : 'Tidak ada pendaftaran akun UPPS yang menunggu verifikasi.'}</span>
            <Link to="/sekretariat/administrasi/akun-upps"><Button size="sm" variant={pendingRegs ? 'primary' : 'secondary'} icon={<UserCheck size={14} />}>Verifikasi Akun UPPS</Button></Link>
          </span>
        </Notice>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpi ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[78px]" />) : <>
          <StatWidget tone="primary" label="Perlu tindakan Anda" value={counts.action} icon={<Inbox size={22} />} />
          <StatWidget tone="warn" label="Sedang berjalan" value={counts.running} hint="Ditangani pihak lain" icon={<Hourglass size={22} />} />
          <StatWidget tone="success" label="Selesai" value={counts.done} hint="Diterbitkan atau dihentikan" icon={<CheckCircle2 size={22} />} />
          <StatWidget tone="neutral" label="Total pengajuan" value={counts.total} icon={<ClipboardList size={22} />} />
        </>}
      </div>
      <div className="space-y-4">
        <Card title="Tugas Saya" actions={<Badge tone={tasks.length ? 'info' : 'neutral'}>{tasks.length} tugas</Badge>}>
          {loading && !rows.length ? <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            : tasks.length ? (
              <DataTable toolbar rows={tasks} rowKey={(t) => `${t.submission.id}-${t.action.key}`} caption="Tugas saya" pageSize={10}
                search={(t) => `${t.action.title} ${t.submission.programName ?? ''} ${t.submission.institutionName ?? ''}`}
                columns={[
                  { key: 't', header: 'Tugas', primary: true, cell: (t) => <span className="font-medium text-ink">{t.action.title}</span> },
                  { key: 'p', header: 'Program studi', cell: (t) => prog(t.submission) },
                  { key: 's', header: 'Posisi', cell: (t) => <StagePill stage={t.submission.stage} /> },
                  { key: 'u', header: 'Diperbarui', cell: (t) => <span className="whitespace-nowrap">{fmtDateTime(t.submission.updatedAt)}</span> },
                  { key: 'a', header: 'Aksi', cell: (t) => <Link to={t.action.to?.(t.submission.id) ?? detail(t.submission)}><Button size="sm" icon={<ArrowRight size={14} />}>{t.action.button}</Button></Link> },
                ]} />
            ) : <EmptyState icon={<CheckCircle2 size={24} />} title="Tidak ada tugas saat ini">Seluruh tugas Bapak/Ibu telah selesai. Daftar terisi otomatis bila ada pengajuan yang memerlukan tindakan.</EmptyState>}
        </Card>
        <Card title="Daftar Pengajuan" actions={<Badge tone="neutral">{rows.length} pengajuan</Badge>}>
          {loading && !rows.length ? <Skeleton className="h-32" /> : (
            <DataTable toolbar rows={filtered} rowKey={(s) => s.id} caption="Daftar pengajuan" searchValue={text} onSearchChange={setText}
              search={(s) => `${s.programName ?? ''} ${s.institutionName ?? ''} ${s.id}`}
              toolbarExtra={<label className="flex items-center gap-2">Tahap<Select aria-label="Saring menurut tahap" value={stage} onChange={(e) => setStage(e.target.value)} className="!w-auto !py-1">{STAGE_FILTERS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</Select></label>}
              emptyText="Tidak ada pengajuan yang sesuai. Ubah kata kunci atau pilih Semua tahap."
              columns={[
                { key: 'p', header: 'Program studi', primary: true, cell: prog },
                { key: 't', header: 'Posisi', cell: (s) => <div className="space-y-1"><StagePill stage={s.stage} /><div className="text-xs text-muted">{progress(s)}</div></div> },
                { key: 'h', header: 'Sedang ditangani', cell: (s) => <Badge tone="neutral">{holderLabel(s)}</Badge> },
                ...(filtered.some((x) => x.aiScore) ? [{ key: 'ai', header: 'Skor AI sementara', align: 'right' as const, cell: (x: SubmissionSummary) => x.aiScore ? <div title="Hasil analisis AI (pendukung, bukan nilai resmi)"><b className="tabular-nums">{fmtNumber(x.aiScore.totals.total)}</b><div className="text-xs text-muted">bukan nilai resmi</div></div> : <span className="text-faint">—</span> }] : []),
                { key: 'u', header: 'Diperbarui', cell: (s) => <span className="whitespace-nowrap">{fmtDateTime(s.updatedAt)}</span> },
                { key: 'o', header: 'Aksi', cell: (s) => <Link to={detail(s)}><Button variant="secondary" size="sm">Detail</Button></Link> },
              ]} />
          )}
        </Card>
      </div>
    </div>
  );
}
