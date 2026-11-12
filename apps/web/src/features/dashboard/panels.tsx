import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Award, Bot, CheckCircle2, Clock3, Hourglass, Inbox, Link2, ShieldAlert, ShieldCheck, Timer } from 'lucide-react';
import type { DashboardStats } from '@akreditasi/shared';
import { Badge, Button, Card, EmptyState, Notice, ProgressBar, Skeleton, StatWidget, StepIndicator, cx } from '../../components/ui';
import { ChartCard, Donut, HBars, RANK_COLORS, SERIES, TrendArea } from '../../components/charts';
import { AUDIT_KIND_LABEL, RANK_LABEL, RECORD_LABEL, fmtDuration, fmtNumber, fmtRelative } from '../../lib/labels';
import { currentIndex } from '../../lib/workflow';
import type { SubmissionSummary } from '../../api/types';
import type { TaskItem } from '../common/useTasks';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Empat kartu KPI. "Perlu tindakan" berasal dari antrean tugas (nextActions), lainnya dari /dashboard/stats. */
export function KpiRow({ stats, actionCount, loading }: { stats?: DashboardStats; actionCount: number; loading: boolean }) {
  if (loading || !stats) return <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[132px] !rounded-xl" />)}</div>;
  const k = stats.kpis;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <StatWidget tone="primary" label="Perlu tindakan Bapak/Ibu" value={fmtNumber(actionCount, 0)} icon={<Inbox size={20} />} to="#tugas-saya"
        hint={actionCount ? 'Lihat daftar tugas di bawah' : 'Tidak ada tugas saat ini'} />
      <StatWidget tone="warn" label="Sedang berjalan" value={fmtNumber(k.inProgress, 0)} icon={<Hourglass size={20} />} hint={`dari ${fmtNumber(k.total, 0)} pengajuan tercatat`} />
      <StatWidget tone="success" label="Selesai dan terbit" value={fmtNumber(k.completed, 0)} icon={<CheckCircle2 size={20} />} hint={k.total ? `${pct(k.completed, k.total)}% dari seluruh pengajuan` : 'Belum ada pengajuan'} />
      <StatWidget tone="neutral" label="Rerata durasi proses" value={k.avgDecisionDays === null ? '—' : <>{fmtNumber(k.avgDecisionDays, 1)}<span className="ml-1.5 text-base font-medium text-muted">hari</span></>} icon={<Timer size={20} />} hint="Pengajuan hingga keputusan" />
    </div>
  );
}

export function StagesCard({ stats, title = 'Pengajuan per tahap' }: { stats: DashboardStats; title?: string }) {
  const data = stats.byStage.map((s) => ({ label: s.index < 9 ? `${s.index + 1}. ${s.label}` : s.label, value: s.count }));
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <ChartCard title={title} description="Jumlah pengajuan pada setiap tahap alur akreditasi"
      ariaLabel={`Diagram batang jumlah pengajuan per tahap. Total ${total} pengajuan.`}
      table={{ columns: ['Tahap', 'Jumlah pengajuan'], rows: data.map((d) => [d.label, d.value]) }}>
      <HBars data={data} />
    </ChartCard>
  );
}

export function TrendCard({ stats }: { stats: DashboardStats }) {
  return (
    <ChartCard title="Tren 12 bulan" description="Pengajuan masuk dibandingkan keputusan yang terbit setiap bulan"
      ariaLabel="Diagram area tren 12 bulan terakhir: pengajuan masuk dan keputusan terbit per bulan."
      legend={[{ label: 'Pengajuan masuk', color: SERIES.blue }, { label: 'Keputusan terbit', color: SERIES.orange }]}
      table={{ columns: ['Bulan', 'Pengajuan masuk', 'Keputusan terbit'], rows: stats.monthly.map((m) => [m.month, m.submitted, m.decided]) }}>
      <TrendArea data={stats.monthly} />
    </ChartCard>
  );
}

export function RanksCard({ stats }: { stats: DashboardStats }) {
  const data = stats.ranks.map((r) => ({ key: r.rank, label: RANK_LABEL[r.rank], value: r.count, color: RANK_COLORS[r.rank]! }));
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <ChartCard title="Distribusi peringkat" description="Peringkat pada keputusan yang sudah ditetapkan"
      ariaLabel={`Diagram donat distribusi peringkat keputusan. Total ${total} keputusan.`}
      table={{ columns: ['Peringkat', 'Jumlah keputusan'], rows: data.map((d) => [d.label, d.value]) }}
      empty={total === 0 ? <EmptyState icon={<Award size={22} />} title="Belum ada keputusan">Distribusi peringkat tampil setelah Majelis Akreditasi menetapkan keputusan pertama.</EmptyState> : undefined}>
      <Donut data={data} centerLabel="keputusan" />
    </ChartCard>
  );
}

export function IntegrityCard({ stats }: { stats: DashboardStats }) {
  const c = stats.chain;
  const total = c.audit.committed + c.audit.pending + c.audit.failed;
  const healthy = c.audit.failed === 0 && c.audit.pending === 0;
  const status = c.audit.failed > 0
    ? <Badge tone="warn" icon={<ShieldAlert size={13} aria-hidden />}>Perlu perhatian</Badge>
    : c.audit.pending > 0 ? <Badge tone="info" icon={<Clock3 size={13} aria-hidden />}>Sedang diproses</Badge>
      : <Badge tone="success" icon={<ShieldCheck size={13} aria-hidden />}>Sehat</Badge>;
  const items: [string, string][] = [
    ['Transaksi on-chain', fmtNumber(c.onChainTx, 0)],
    ['Blok terakhir tercatat', c.lastBlock === null ? '—' : fmtNumber(c.lastBlock, 0)],
    ['Jeda audit rerata', fmtDuration(c.auditLagAvgSec)],
    ['Jeda audit p95', fmtDuration(c.auditLagP95Sec)],
    ['Catatan koreksi', fmtNumber(c.corrections, 0)],
  ];
  return (
    <Card title="Integritas blockchain" description="Pencatatan resmi dan jejak audit" actions={status} className="h-full">
      <div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-medium text-ink">Jejak audit tercatat permanen</span><b className="tabular-nums text-ink">{pct(c.audit.committed, total)}%</b></div>
      <ProgressBar value={c.audit.committed} max={Math.max(total, 1)} label="Persentase jejak audit tercatat permanen" />
      <p className="mt-1.5 text-sm text-muted">
        {fmtNumber(c.audit.committed, 0)} tercatat, {fmtNumber(c.audit.pending, 0)} tertunda, {fmtNumber(c.audit.failed, 0)} gagal dan akan dicoba ulang.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4">
        {items.map(([k, v], i) => <div key={k} className={cx(i === 4 && 'col-span-2 sm:col-span-1')}><dt className="text-sm text-muted">{k}</dt><dd className="text-lg font-semibold tabular-nums text-ink">{v}</dd></div>)}
      </dl>
      {!healthy && c.audit.failed > 0 && <p className="mt-3 text-sm text-wait">Sebagian jejak audit belum berhasil dicatat. Sistem mencoba ulang secara otomatis.</p>}
    </Card>
  );
}

const AI_STATUS: Record<string, { label: string; tone: 'success' | 'info' | 'warn' | 'danger' | 'neutral' }> = {
  done: { label: 'Selesai', tone: 'success' }, queued: { label: 'Dalam antrean', tone: 'info' }, running: { label: 'Sedang berjalan', tone: 'info' }, failed: { label: 'Gagal', tone: 'danger' },
};
export function AiCard({ stats }: { stats: DashboardStats }) {
  const a = stats.ai;
  const total = a.byStatus.reduce((x, r) => x + r.count, 0);
  return (
    <Card title="Analisis AI" description="Pendukung keputusan, bukan nilai resmi" actions={<Bot size={18} className="text-faint" aria-hidden />} className="h-full">
      {total === 0 ? <p className="text-sm text-muted">Belum ada analisis AI yang tercatat.</p> : (
        <ul className="space-y-2 text-sm">
          {a.byStatus.map((r) => { const m = AI_STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const }; return <li key={r.status} className="flex items-center justify-between gap-2"><Badge tone={m.tone}>{m.label}</Badge><b className="tabular-nums text-ink">{fmtNumber(r.count, 0)}</b></li>; })}
        </ul>
      )}
      <dl className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm">
        <div><dt className="text-muted">Rerata waktu analisis</dt><dd className="text-lg font-semibold tabular-nums text-ink">{fmtDuration(a.avgLatencySec)}</dd></div>
        <div><dt className="text-muted">Kesesuaian saran dengan skor akhir</dt>
          <dd className="text-lg font-semibold tabular-nums text-ink">{a.agreement.compared ? `${fmtNumber(a.agreement.within, 0)} dari ${fmtNumber(a.agreement.compared, 0)}` : '—'}</dd>
          <dd className="text-xs text-faint">{a.agreement.compared ? `Selisih dalam 10% skor maksimum. Rerata selisih ${fmtNumber(a.agreement.meanAbsDiffPct, 1)}%.` : 'Tampil setelah ada analisis dan skor akhir asesor.'}</dd></div>
      </dl>
    </Card>
  );
}

const ACT_ICON = { record: Link2, audit: Activity } as const;
export function ActivityCard({ stats, wide }: { stats: DashboardStats; wide?: boolean }) {
  return (
    <Card title="Aktivitas terbaru" description="Catatan resmi dan peristiwa audit terakhir" className="h-full">
      {stats.recent.length === 0 ? <EmptyState icon={<Activity size={22} />} title="Belum ada aktivitas" /> : (
        <ol className={cx(wide ? 'grid gap-x-10 gap-y-4 lg:grid-cols-2' : 'relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-slate-200')}>
          {stats.recent.map((r, i) => {
            const Icon = ACT_ICON[r.kind];
            const label = r.kind === 'record' ? RECORD_LABEL[r.type] ?? r.type : AUDIT_KIND_LABEL[r.type] ?? r.type;
            const ok = r.status === 'committed';
            const bad = r.status === 'failed';
            const body = (
              <>
                <span className="block font-medium text-ink">{label}</span>
                <span className="block text-sm text-muted">{[r.programName, r.institutionName].filter(Boolean).join(' · ')}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-faint">
                  <span>{fmtRelative(r.at)}</span>
                  <Badge tone={ok ? 'chain' : bad ? 'danger' : 'warn'}>{ok ? 'Tercatat permanen' : bad ? 'Pencatatan gagal' : 'Menunggu pencatatan'}</Badge>
                </span>
              </>
            );
            return (
              <li key={i} className="relative flex gap-3">
                <span className={cx('z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-white', r.kind === 'record' ? 'bg-chain-bg text-chain' : 'bg-slate-100 text-slate-600')} aria-hidden><Icon size={15} /></span>
                {r.submissionId ? <Link to={`/pengajuan/${r.submissionId}`} className="min-w-0 flex-1 rounded-lg px-1 hover:bg-slate-50">{body}</Link> : <div className="min-w-0 flex-1">{body}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

const STAGE_STEPS = ['Pengajuan', 'Verifikasi', 'Pembayaran', 'Penugasan dan AK', 'Asesmen Lapangan', 'Tanggapan', 'Verifikasi akhir', 'Penetapan', 'Penerbitan'];

/** UPPS: kartu progres tahap untuk pengajuan aktif terbaru + tugas berikutnya. */
export function UppsProgressCard({ rows, tasks }: { rows: SubmissionSummary[]; tasks: TaskItem[] }) {
  const active = (tasks[0] && rows.find((s) => s.id === tasks[0]!.submission.id)) || rows.find((s) => s.stage !== 'released' && s.stage !== 'admin_rejected') || rows[0];
  if (!active) {
    return <Notice tone="info" title="Belum ada pengajuan">Mulai dengan memilih tombol Ajukan Akreditasi Baru. Progres tahap akan tampil di sini.</Notice>;
  }
  const idx = currentIndex(active);
  const task = tasks.find((t) => t.submission.id === active.id);
  const name = `${active.programName ?? 'Pengajuan'}${active.programLevel ? ` (${active.programLevel})` : ''}`;
  return (
    <Card title={name} description={`${active.institutionName ?? ''} · ${idx >= 9 ? 'Seluruh tahap selesai' : `Tahap ${idx + 1} dari 9`}`}
      actions={<Link to={`/pengajuan/${active.id}`}><Button variant="secondary" size="sm" icon={<ArrowRight size={14} />}>Buka detail</Button></Link>}>
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[720px]">
          <StepIndicator steps={STAGE_STEPS.map((label, i) => ({ label, state: idx >= 9 || i < idx ? 'done' : i === idx ? 'current' : 'todo' }))} />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy-50 px-4 py-3">
        <div className="min-w-0 text-sm"><p className="font-semibold text-navy-900">{task ? 'Tugas berikutnya' : 'Menunggu pihak lain'}</p><p className="text-slate-700">{task ? task.action.title : 'Belum ada tindakan untuk Bapak/Ibu pada pengajuan ini.'}</p></div>
        {task && <Link to={task.action.to?.(active.id) ?? `/pengajuan/${active.id}`}><Button icon={<ArrowRight size={15} />}>{task.action.button}</Button></Link>}
      </div>
    </Card>
  );
}
