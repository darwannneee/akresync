import { Link } from 'react-router-dom';
import { Activity, Award, Bot, CheckCircle2, Clock3, Inbox, Link2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { DashboardStats } from '@akreditasi/shared';
import { Badge, ButtonLink, Card, EmptyState, Notice, ProgressBar, SegProgress, Skeleton, cx } from '../../components/ui';
import { ChartCard, Donut, HBars, RANK_COLORS, SERIES, TrendArea, trendLabel } from '../../components/charts';
import { AUDIT_KIND_LABEL, RANK_LABEL, RECORD_LABEL, fmtDays, fmtDuration, fmtNumber, fmtRelative, shortId } from '../../lib/labels';
import { currentIndex, holderLabel } from '../../lib/workflow';
import type { SubmissionSummary } from '../../api/types';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export const STAGE_STEPS = ['Pengajuan', 'Verifikasi kelengkapan', 'Tagihan dan pembayaran', 'Penugasan, AK, dan jadwal AL', 'Asesmen Lapangan', 'Tanggapan', 'Verifikasi akhir', 'Penetapan', 'Penerbitan'];

/** Ringkasan angka utama. "Perlu tindakan" berasal dari antrean tugas (nextActions), lainnya dari /dashboard/stats. */
export function SummaryCard({ stats, actionCount }: { stats?: DashboardStats; actionCount: number }) {
  const k = stats?.kpis;
  const items: [string, string, string][] = k ? [
    ['Perlu tindakan', fmtNumber(actionCount, 0), actionCount ? 'Menunggu Bapak/Ibu' : 'Tidak ada tugas'],
    ['Sedang berjalan', fmtNumber(k.inProgress, 0), `dari ${fmtNumber(k.total, 0)} pengajuan`],
    ['Selesai dan terbit', fmtNumber(k.completed, 0), k.total ? `${pct(k.completed, k.total)}% dari seluruh pengajuan` : 'Belum ada pengajuan'],
    ['Rerata durasi', k.avgDecisionDays === null ? '—' : fmtDays(k.avgDecisionDays), k.avgDecisionDays === null ? 'Setelah keputusan pertama' : 'Pengajuan hingga keputusan'],
  ] : [];
  return (
    <section className="card p-[22px]" aria-label="Ringkasan statistik">
      <div className="lbl">Ringkasan</div>
      {!k ? <div className="mt-4 grid grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
          {items.map(([l, v, h]) => <div key={l} className="min-w-0"><dt className="text-[13px] text-faint">{l}</dt><dd className="mt-1 text-[22px] font-semibold leading-none tracking-tight tabular-nums text-ink">{v}</dd><dd className="mt-1 text-[12.5px] text-faint">{h}</dd></div>)}
        </dl>
      )}
    </section>
  );
}

/** Jumlah catatan permanen dan keutuhan jejak audit. */
export function ProofCard({ stats, loading }: { stats?: DashboardStats; loading?: boolean }) {
  const c = stats?.chain;
  return (
    <section className="card p-[22px]" aria-label="Bukti pencatatan">
      <div className="lbl">Bukti pencatatan</div>
      {!c ? (loading ? <Skeleton className="mt-3 h-10" /> : <p className="mt-3 text-[14px] text-faint">Belum dapat dimuat.</p>) : (
        <>
          <div className="mt-3 flex items-baseline gap-2"><span className="text-[28px] font-semibold leading-none tabular-nums text-ink">{fmtNumber(c.onChainTx, 0)}</span><span className="text-muted">catatan permanen</span></div>
          {c.audit.failed > 0 ? <p className="mt-2 flex items-start gap-2 text-[14px] text-wait"><ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />{fmtNumber(c.audit.failed, 0)} jejak audit gagal dicatat permanen. Hubungi administrator.</p>
            : c.audit.pending > 0 ? <p className="mt-2 flex items-start gap-2 text-[14px] text-muted"><Clock3 size={16} className="mt-0.5 shrink-0" aria-hidden />{fmtNumber(c.audit.pending, 0)} jejak audit sedang dicatat otomatis.</p>
              : <p className="mt-2 flex items-center gap-2 text-[14px] text-ok"><CheckCircle2 size={16} className="shrink-0" aria-hidden />Semua terverifikasi utuh</p>}
        </>
      )}
    </section>
  );
}

export function StagesCard({ stats, title = 'Pengajuan per tahap' }: { stats: DashboardStats; title?: string }) {
  const data = stats.byStage.map((s) => ({ label: s.index < 9 ? `${s.index + 1}. ${s.label}` : s.label, value: s.count }));
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <ChartCard title={title} description="Jumlah pengajuan pada setiap tahap alur akreditasi" empty={total === 0 ? <EmptyState icon={<Inbox size={22} />} title="Belum ada pengajuan">Diagram tahap tampil setelah pengajuan pertama dibuat.</EmptyState> : undefined}
      ariaLabel={`Diagram batang jumlah pengajuan per tahap. Total ${total} pengajuan.`}
      table={{ columns: ['Tahap', 'Jumlah pengajuan'], rows: data.map((d) => [d.label, d.value]) }}>
      <HBars data={data} />
    </ChartCard>
  );
}

const TREND_TITLE = { day: 'Tren harian', week: 'Tren mingguan', month: 'Tren 12 bulan' } as const;
export function TrendCard({ stats }: { stats: DashboardStats }) {
  const { granularity: g, points } = stats.trend;
  const span = g === 'day' ? `${points.length} hari terakhir` : g === 'week' ? `${points.length} minggu terakhir` : '12 bulan terakhir';
  const empty = points.every((p) => p.submitted === 0 && p.decided === 0);
  return (
    <ChartCard fill title={g === 'day' ? `Tren ${points.length} hari terakhir` : g === 'week' ? `Tren ${points.length} minggu terakhir` : TREND_TITLE.month} className="h-full"
      description={`Pengajuan masuk dibandingkan keputusan yang terbit, per ${g === 'day' ? 'hari' : g === 'week' ? 'minggu' : 'bulan'} selama ${span}`}
      ariaLabel={`Diagram area tren ${span}: pengajuan masuk dan keputusan terbit.`}
      legend={[{ label: 'Pengajuan masuk', color: SERIES.blue }, { label: 'Keputusan terbit', color: SERIES.orange }]}
      table={{ columns: [g === 'day' ? 'Tanggal' : g === 'week' ? 'Minggu mulai' : 'Bulan', 'Pengajuan masuk', 'Keputusan terbit'], rows: points.map((m) => [trendLabel(m.key, g), m.submitted, m.decided]) }}
      empty={empty ? <EmptyState icon={<Activity size={22} />} title="Belum ada data tren">Tren tampil setelah ada pengajuan masuk atau keputusan terbit.</EmptyState> : undefined}>
      <TrendArea data={points} granularity={g} />
    </ChartCard>
  );
}

export function RanksCard({ stats }: { stats: DashboardStats }) {
  const data = stats.ranks.map((r) => ({ key: r.rank, label: RANK_LABEL[r.rank], value: r.count, color: RANK_COLORS[r.rank]! }));
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <ChartCard fill className="h-full" title="Distribusi peringkat" description="Peringkat pada keputusan yang sudah ditetapkan"
      ariaLabel={`Diagram donat distribusi peringkat keputusan. Total ${total} keputusan.`}
      table={{ columns: ['Peringkat', 'Jumlah keputusan'], rows: data.map((d) => [d.label, d.value]) }}
      empty={total === 0 ? <EmptyState icon={<Award size={22} />} title="Belum ada keputusan">Distribusi peringkat tampil setelah Majelis Akreditasi menetapkan keputusan pertama.</EmptyState> : undefined}>
      <Donut data={data} centerLabel="keputusan" />
    </ChartCard>
  );
}

/** `detailed`: metrik teknis (blok, jeda audit, koreksi) hanya untuk KEA, Majelis, dan Sekretariat Administrasi. */
export function IntegrityCard({ stats, detailed = true }: { stats: DashboardStats; detailed?: boolean }) {
  const c = stats.chain;
  const total = c.audit.committed + c.audit.pending + c.audit.failed;
  const status = c.audit.failed > 0
    ? <Badge tone="warn" icon={<ShieldAlert size={13} aria-hidden />}>Perlu perhatian</Badge>
    : c.audit.pending > 0 ? <Badge tone="info" icon={<Clock3 size={13} aria-hidden />}>Sedang diproses</Badge>
      : <Badge tone="success" icon={<ShieldCheck size={13} aria-hidden />}>Sehat</Badge>;
  const items: [string, string][] = [
    ['Transaksi tercatat permanen', fmtNumber(c.onChainTx, 0)],
    ['Blok terakhir tercatat', c.lastBlock === null ? '—' : fmtNumber(c.lastBlock, 0)],
    ['Jeda audit rerata', fmtDuration(c.auditLagAvgSec)],
    ['Jeda audit terlama (95% peristiwa)', fmtDuration(c.auditLagP95Sec)],
    ['Catatan koreksi', fmtNumber(c.corrections, 0)],
  ];
  return (
    <Card title="Pencatatan permanen" description="Catatan resmi dan jejak audit" actions={status} className="h-full">
      <div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-medium text-ink">Jejak audit tercatat permanen</span><b className="tabular-nums text-ink">{pct(c.audit.committed, total)}%</b></div>
      <ProgressBar value={c.audit.committed} max={Math.max(total, 1)} label="Persentase jejak audit tercatat permanen" />
      <p className="mt-1.5 text-sm text-muted">
        {fmtNumber(c.audit.committed, 0)} tercatat, {fmtNumber(c.audit.pending, 0)} sedang dicatat atau dicoba ulang otomatis, {fmtNumber(c.audit.failed, 0)} gagal permanen.
      </p>
      {detailed && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4">
          {items.map(([k, v]) => <div key={k}><dt className="text-sm text-muted">{k}</dt><dd className="text-lg font-semibold tabular-nums text-ink">{v}</dd></div>)}
        </dl>
      )}
      {c.audit.failed > 0 && <p className="mt-3 text-sm text-wait">Sebagian jejak audit gagal dicatat secara permanen. Hubungi administrator untuk menindaklanjuti.</p>}
      {c.audit.failed === 0 && c.audit.pending > 0 && <p className="mt-3 text-sm text-muted">Jejak audit yang belum tercatat dicoba ulang otomatis oleh sistem.</p>}
    </Card>
  );
}

const AI_STATUS: Record<string, { label: string; tone: 'success' | 'info' | 'warn' | 'danger' | 'neutral' }> = {
  done: { label: 'Selesai', tone: 'success' }, queued: { label: 'Dalam antrean', tone: 'info' }, running: { label: 'Sedang berjalan', tone: 'info' }, failed: { label: 'Tidak berhasil', tone: 'warn' },
};
export function AiCard({ stats }: { stats: DashboardStats }) {
  const a = stats.ai;
  const total = a.byStatus.reduce((x, r) => x + r.count, 0);
  return (
    <Card title="Analisis AI" description="Pendukung keputusan, bukan nilai resmi" actions={<Bot size={18} className="text-faint" aria-hidden />} className="h-full">
      {!a.enabled && <div className="mb-3"><Notice tone="info">Layanan AI belum dikonfigurasi atau sedang nonaktif. Analisis yang tidak berhasil umumnya berasal dari kondisi ini dan tidak memengaruhi alur akreditasi.</Notice></div>}
      {a.enabled && a.byStatus.some((r) => r.status === 'failed' && r.count > 0) && <p className="mb-3 text-sm text-muted">Analisis yang tidak berhasil dapat diminta ulang oleh KEA pada tab Analisis AI di pengajuan terkait.</p>}
      {total === 0 ? <p className="text-sm text-muted">Belum ada analisis AI yang tercatat.</p> : (
        <ul className="space-y-2 text-sm">
          {a.byStatus.map((r) => { const base = AI_STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const }; const m = r.status === 'failed' && !a.enabled ? { ...base, tone: 'neutral' as const } : base; return <li key={r.status} className="flex items-center justify-between gap-2"><Badge tone={m.tone}>{m.label}</Badge><b className="tabular-nums text-ink">{fmtNumber(r.count, 0)}</b></li>; })}
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

type Recent = DashboardStats['recent'][number];
/** Gabungkan peristiwa sejenis yang berurutan pada pengajuan yang sama (mis. "Draf penilaian disimpan (6 kali)"). */
export function groupRecent(rows: Recent[]): (Recent & { n: number })[] {
  const out: (Recent & { n: number })[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.kind === r.kind && last.type === r.type && last.submissionId === r.submissionId) {
      last.n++;
      if (r.status !== 'committed') last.status = r.status;
    } else out.push({ ...r, n: 1 });
  }
  return out;
}

export function ActivityCard({ stats, wide }: { stats: DashboardStats; wide?: boolean }) {
  const groups = groupRecent(stats.recent).slice(0, 8);
  return (
    <Card title="Aktivitas terbaru" description="Catatan resmi dan peristiwa audit terakhir" className="h-full">
      {groups.length === 0 ? <EmptyState icon={<Activity size={22} />} title="Belum ada aktivitas" /> : (
        <ol className={cx(wide ? 'grid gap-x-10 gap-y-4 lg:grid-cols-2' : 'relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-slate-200')}>
          {groups.map((r, i) => {
            const Icon = ACT_ICON[r.kind];
            const label = r.kind === 'record' ? RECORD_LABEL[r.type] ?? r.type : AUDIT_KIND_LABEL[r.type] ?? r.type;
            const ok = r.status === 'committed';
            const bad = r.status === 'failed';
            const body = (
              <>
                <span className="block font-medium text-ink">{label}{r.n > 1 ? ` (${r.n} kali)` : ''}</span>
                <span className="block text-sm text-muted">{[r.programName, r.institutionName].filter(Boolean).join(' · ')}</span>
                {r.submissionId && <span className="block text-xs text-faint">Nomor pengajuan <span className="font-mono">{shortId(r.submissionId)}</span></span>}
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-faint">
                  <span>{fmtRelative(r.at)}</span>
                  <Badge tone={ok ? 'chain' : bad ? 'danger' : 'warn'}>{ok ? 'Tercatat permanen' : bad ? 'Gagal permanen' : 'Sedang dicatat'}</Badge>
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

const time = (s: SubmissionSummary) => Date.parse(s.updatedAt ?? s.createdAt ?? '') || 0;

/** UPPS: progres tahap pengajuan aktif (bukan draf) yang terakhir diperbarui. */
export function RunningCard({ rows }: { rows: SubmissionSummary[] }) {
  const active = rows.filter((s) => !['draft', 'released', 'admin_rejected'].includes(s.stage)).sort((a, b) => time(b) - time(a))[0];
  if (!active) return null;
  const idx = Math.min(currentIndex(active), 9);
  return (
    <section className="card p-[22px]" aria-label="Pengajuan yang sedang berjalan">
      <div className="lbl">Sedang berjalan</div>
      <div className="mt-2 text-[17px] font-semibold leading-snug text-ink">{active.programName ?? shortId(active.id)}{active.programLevel ? ` (${active.programLevel})` : ''}</div>
      <div className="mt-4"><SegProgress total={9} done={idx} /></div>
      <div className="mt-3 text-[14px] text-muted">{idx >= 9 ? 'Seluruh tahap selesai' : `Langkah ${idx + 1} dari 9 · ${STAGE_STEPS[idx]}`}</div>
      <div className="mt-1 text-[14px] text-faint">Ditangani oleh {holderLabel(active)}</div>
      <ButtonLink to={`/pengajuan/${active.id}`} variant="secondary" className="mt-5 w-full">Lihat detail</ButtonLink>
    </section>
  );
}
