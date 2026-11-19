import { useQuery } from '@tanstack/react-query';
import type { DashboardStats } from '@akreditasi/shared';
import { api, errorMessage } from '../api/client';
import { Card, FormError, PageHeader, PageSkeleton, ProgressBar, StatusDot } from '../components/ui';
import { ActivityCard, chainHealth } from '../features/dashboard/panels';
import { fmtDateTime, fmtDays, fmtDuration, fmtNumber } from '../lib/labels';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Figures({ items, cols = 4 }: { items: [string, string, string?][]; cols?: 2 | 3 | 4 }) {
  return (
    <dl className={`grid gap-x-6 gap-y-5 ${cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {items.map(([k, v, h]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[13px] text-faint">{k}</dt>
          <dd className="mt-1 text-[24px] font-semibold leading-none tracking-tight tabular-nums text-ink">{v}</dd>
          {h && <dd className="mt-1 text-[12.5px] text-faint">{h}</dd>}
        </div>
      ))}
    </dl>
  );
}

const AI_LABEL: Record<string, { label: string; tone: 'ok' | 'navy' | 'warn' | 'gray' }> = {
  done: { label: 'Selesai', tone: 'ok' }, queued: { label: 'Dalam antrean', tone: 'navy' }, running: { label: 'Sedang berjalan', tone: 'navy' }, failed: { label: 'Tidak berhasil', tone: 'warn' },
};

/** Pemantauan untuk KEA, Majelis, dan Sekretariat Administrasi: operasional, integritas blockchain + antrean audit (outbox), dan AI. */
export function MonitoringPage() {
  const q = useQuery({ queryKey: ['dashboard-stats'], refetchInterval: 15_000, queryFn: async () => (await api.get<DashboardStats>('/dashboard/stats')).data });
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <FormError message={errorMessage(q.error)} />;
  const s = q.data;
  const k = s.kpis;
  const c = s.chain;
  const h = chainHealth(c);
  const auditTotal = c.audit.committed + c.audit.pending + c.audit.failed;
  const aiTotal = s.ai.byStatus.reduce((a, r) => a + r.count, 0);
  return (
    <div>
      <PageHeader title="Pemantauan" description={`Integritas pencatatan, antrean audit, dan kinerja AI. Diperbarui otomatis · ${fmtDateTime(s.generatedAt)}`} />
      <div className="space-y-6">
        <Card title="Operasional">
          <Figures items={[
            ['Total pengajuan', fmtNumber(k.total, 0)],
            ['Sedang berjalan', fmtNumber(k.inProgress, 0)],
            ['Selesai dan terbit', fmtNumber(k.completed, 0), k.total ? `${pct(k.completed, k.total)}% dari seluruh pengajuan` : undefined],
            ['Rerata durasi', fmtDays(k.avgDecisionDays), k.avgDecisionDays === null ? 'Tampil setelah keputusan pertama' : 'Dari pengajuan hingga keputusan'],
          ]} />
        </Card>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <Card title="Blockchain dan antrean audit" description="Catatan resmi ditulis langsung ke blockchain; data lain tersimpan di sistem lalu jejak auditnya dikirim melalui antrean (outbox) ke blockchain." actions={<StatusDot tone={h.tone}>{h.tone === 'ok' ? 'Sehat' : h.tone === 'warn' ? 'Sedang diproses' : 'Perlu perhatian'}</StatusDot>}>
              <div className="mb-1.5 flex items-baseline justify-between text-[14.5px]"><span className="font-medium text-ink">Jejak audit tercatat di blockchain</span><b className="tabular-nums text-ink">{pct(c.audit.committed, auditTotal)}%</b></div>
              <ProgressBar value={c.audit.committed} max={Math.max(auditTotal, 1)} label="Persentase jejak audit tercatat" />
              <p className="mt-2 text-[14px] text-muted">{h.text}.</p>
              <div className="mt-6 border-t border-line pt-6">
                <Figures cols={3} items={[
                  ['Transaksi on-chain', fmtNumber(c.onChainTx, 0), 'Catatan resmi dan jejak audit'],
                  ['Blok terakhir', c.lastBlock === null ? '—' : fmtNumber(c.lastBlock, 0)],
                  ['Catatan koreksi', fmtNumber(c.corrections, 0), 'Koreksi melalui catatan baru'],
                  ['Audit tercatat', fmtNumber(c.audit.committed, 0)],
                  ['Audit tertunda', fmtNumber(c.audit.pending, 0), 'Dicoba ulang otomatis'],
                  ['Audit gagal', fmtNumber(c.audit.failed, 0)],
                  ['Jeda audit rerata', fmtDuration(c.auditLagAvgSec), 'Dari outbox hingga tercatat'],
                  ['Jeda audit p95', fmtDuration(c.auditLagP95Sec), '95% peristiwa di bawah angka ini'],
                ]} />
              </div>
            </Card>
            <ActivityCard stats={s} />
          </div>

          <aside className="lg:col-span-4">
            <Card title="Analisis AI" description="Pendukung keputusan, bukan nilai resmi">
              {!s.ai.enabled && <p className="mb-4 text-[14px] text-muted">Layanan AI belum dikonfigurasi atau sedang nonaktif.</p>}
              {aiTotal === 0 ? <p className="text-[14px] text-muted">Belum ada analisis yang tercatat.</p> : (
                <ul className="space-y-2.5">
                  {s.ai.byStatus.map((r) => { const m = AI_LABEL[r.status] ?? { label: r.status, tone: 'gray' as const }; return <li key={r.status} className="flex items-center justify-between"><StatusDot tone={m.tone}>{m.label}</StatusDot><b className="tabular-nums text-ink">{fmtNumber(r.count, 0)}</b></li>; })}
                </ul>
              )}
              <div className="mt-6 border-t border-line pt-6">
                <Figures cols={2} items={[
                  ['Rerata waktu analisis', fmtDuration(s.ai.avgLatencySec)],
                  ['Sesuai skor asesor', s.ai.agreement.compared ? `${fmtNumber(s.ai.agreement.within, 0)}/${fmtNumber(s.ai.agreement.compared, 0)}` : '—', s.ai.agreement.compared ? `Selisih rerata ${fmtNumber(s.ai.agreement.meanAbsDiffPct, 1)}%` : 'Setelah ada skor akhir'],
                ]} />
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
