import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Link2 } from 'lucide-react';
import type { DashboardStats } from '@akreditasi/shared';
import { ButtonLink, Card, EmptyState, SegProgress, Skeleton, StatusDot, cx } from '../../components/ui';
import { AUDIT_KIND_LABEL, RECORD_LABEL, fmtNumber, fmtRelative, shortId } from '../../lib/labels';
import { currentIndex, holderLabel } from '../../lib/workflow';
import type { SubmissionSummary } from '../../api/types';

export const STAGE_STEPS = ['Pengajuan', 'Verifikasi kelengkapan', 'Tagihan dan pembayaran', 'Penugasan, AK, dan jadwal AL', 'Asesmen Lapangan', 'Tanggapan', 'Verifikasi akhir', 'Penetapan', 'Penerbitan'];

/** Kesehatan pencatatan: gagal → bad, tertunda → warn, selain itu ok. */
export function chainHealth(c: DashboardStats['chain']): { tone: 'ok' | 'warn' | 'bad'; text: string } {
  if (c.audit.failed > 0) return { tone: 'bad', text: `${fmtNumber(c.audit.failed, 0)} jejak audit gagal dicatat permanen` };
  if (c.audit.pending > 0) return { tone: 'warn', text: `${fmtNumber(c.audit.pending, 0)} jejak audit sedang dicatat otomatis` };
  return { tone: 'ok', text: 'Seluruh jejak audit telah tercatat di blockchain' };
}

/** Beranda KEA/Majelis/Sek. Adm.: ringkasan satu baris dan tautan ke halaman Pemantauan. */
export function MonitorLinkCard({ stats, loading }: { stats?: DashboardStats; loading?: boolean }) {
  const c = stats?.chain;
  const h = c ? chainHealth(c) : null;
  return (
    <section className="card p-[22px]" aria-label="Pemantauan">
      <div className="lbl">Pemantauan</div>
      {!c || !h ? (loading ? <Skeleton className="mt-3 h-10" /> : <p className="mt-3 text-[14px] text-faint">Belum dapat dimuat.</p>) : (
        <>
          <div className="mt-3 flex items-baseline gap-2"><span className="text-[28px] font-semibold leading-none tabular-nums text-ink">{fmtNumber(c.onChainTx, 0)}</span><span className="text-muted">catatan di blockchain</span></div>
          <StatusDot tone={h.tone} className="mt-2">{h.text}</StatusDot>
        </>
      )}
      <ButtonLink to="/pemantauan" variant="secondary" className="mt-5 w-full" icon={<ArrowRight size={15} />}>Buka pemantauan</ButtonLink>
    </section>
  );
}

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

export function ActivityCard({ stats, limit = 10 }: { stats: DashboardStats; limit?: number }) {
  const groups = groupRecent(stats.recent).slice(0, limit);
  return (
    <Card title="Aktivitas terbaru" description="Catatan resmi dan peristiwa audit terakhir" flush>
      {groups.length === 0 ? <div className="p-[22px]"><EmptyState icon={<Activity size={22} />} title="Belum ada aktivitas" /></div> : (
        <ol className="divide-y divide-line">
          {groups.map((r, i) => {
            const Icon = r.kind === 'record' ? Link2 : Activity;
            const label = r.kind === 'record' ? RECORD_LABEL[r.type] ?? r.type : AUDIT_KIND_LABEL[r.type] ?? r.type;
            const body = (
              <div className="flex items-start gap-3 px-[22px] py-3.5">
                <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full', r.kind === 'record' ? 'bg-navy-50 text-navy-700' : 'bg-slate-100 text-muted')} aria-hidden><Icon size={15} /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">{label}{r.n > 1 ? ` (${r.n} kali)` : ''}</div>
                  <div className="text-[13.5px] text-faint">{[r.programName, r.institutionName, r.submissionId && shortId(r.submissionId)].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="shrink-0 text-right">
                  <StatusDot tone={r.status === 'committed' ? 'ok' : r.status === 'failed' ? 'bad' : 'warn'}>{r.status === 'committed' ? (r.kind === 'record' ? 'Tercatat on-chain' : 'Audit tercatat') : r.status === 'failed' ? 'Gagal' : 'Sedang dicatat'}</StatusDot>
                  <div className="text-[12.5px] text-faint">{fmtRelative(r.at)}</div>
                </div>
              </div>
            );
            return <li key={i}>{r.submissionId ? <Link to={`/pengajuan/${r.submissionId}`} className="block hover:bg-slate-50">{body}</Link> : body}</li>;
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
