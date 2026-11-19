import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AuditEventView, SubmissionDetail, User } from '../../api/types';
import { Button, ButtonLink, Drawer, SegProgress, TaskBanner, cx } from '../../components/ui';
import { buildWorkflow, currentIndex, holderLabel, nextActions, type ActionKey, type MainStage, type NextAction } from '../../lib/workflow';
import { fmtDate } from '../../lib/labels';
import { ActionForm } from './ActionForm';
import { StageTracker } from './StageTracker';
import type { DetailTab } from './types';

const WIDE: ActionKey[] = ['offer', 'reoffer', 'final_verify', 'decision'];
const NOTE: Record<string, string> = { C: 'Tersimpan permanen. Kekeliruan diperbaiki lewat catatan koreksi.', A: 'Tersimpan dengan jejak audit.' };

/** Judul posisi: sub-langkah aktif tunggal bila ada, selain itu nama tahap. */
function stageTitle(st: MainStage): string {
  if (st.status === 'ditolak') return 'Pengajuan ditolak pada verifikasi kelengkapan';
  if (st.parallel) return st.short;
  const active = st.steps.filter((x) => x.status === 'aktif');
  return active.length === 1 ? active[0]!.label : st.label;
}

/**
 * Kartu "posisi saat ini": langkah berjalan, penanggung jawab, progres sembilan langkah, dan tugas pengguna.
 * Tugas bertautan membuka halaman kerjanya; tugas lain dibuka dalam panel samping (Drawer).
 */
export function NextStepCard({ s, user, audit, goTab }: { s: SubmissionDetail; user: User; audit: AuditEventView[]; goTab: (t: DetailTab) => void }) {
  const { actions, waiting, finished } = nextActions(s, user);
  const [openKey, setOpenKey] = useState<ActionKey | null>(null);
  const [all, setAll] = useState(false);
  const active = actions.find((a) => a.key === openKey) ?? null;
  const cur = currentIndex(s);
  const stages = buildWorkflow(s);
  const st = stages[Math.min(cur, 8)]!;
  const done = cur >= 9;
  const name = s.programName ? `${s.programName}${s.programLevel ? ` (${s.programLevel})` : ''}` : 'Pengajuan';
  const holder = holderLabel(s);
  const since = fmtDate(s.updatedAt ?? s.createdAt);
  const start = (a: NextAction) => a.to
    ? <ButtonLink to={a.to(s.id)} className="shrink-0">Mulai</ButtonLink>
    : <Button className="shrink-0" onClick={() => setOpenKey(a.key)}>Mulai</Button>;
  return (
    <section aria-label="Posisi pengajuan" className="card">
      <div className="grid gap-6 p-[22px] lg:grid-cols-12 lg:items-center">
        <div className="min-w-0 lg:col-span-7">
          <div className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-faint">{done ? 'Proses selesai · 9 dari 9 langkah' : `Posisi saat ini · langkah ${cur + 1} dari 9`}</div>
          <div className="mt-1.5 text-[19px] font-semibold leading-snug text-ink">{done ? 'Hasil akreditasi telah diterbitkan' : stageTitle(st)}</div>
          <div className="mt-0.5 text-[14px] text-muted">{finished ? `${holder} · diperbarui ${since}` : `Ditangani ${holder} sejak ${since}`}</div>
          <div className="mt-4"><SegProgress total={9} done={Math.min(cur, 9)} current={!finished} /></div>
          <Button variant="ghost" size="sm" className="no-print -ml-3 mt-3" aria-expanded={all} onClick={() => setAll((v) => !v)}
            icon={<ChevronDown size={15} className={cx('transition-transform', all && 'rotate-180')} aria-hidden />}>{all ? 'Sembunyikan langkah' : 'Lihat semua langkah'}</Button>
        </div>
        <div className="no-print min-w-0 lg:col-span-5">
          {actions.length === 1 ? (
            <TaskBanner title={actions[0]!.title} action={start(actions[0]!)} />
          ) : actions.length > 1 ? (
            <div className="rounded-xl bg-navy-50 p-4">
              <div className="text-[13px] font-semibold text-navy-700">Giliran Bapak/Ibu · {actions.length} tugas</div>
              <ul className="mt-2 divide-y divide-navy-100">
                {actions.map((a) => <li key={a.key} className="flex items-center gap-4 py-2.5 last:pb-0"><span className="min-w-0 flex-1 font-semibold text-ink">{a.title}</span>{start(a)}</li>)}
              </ul>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-[13px] font-semibold text-muted">{finished && s.stage === 'released' ? 'Proses selesai' : 'Belum ada tugas untuk Bapak/Ibu'}</div>
              <p className="mt-0.5 text-[14.5px] text-ink">{waiting}</p>
            </div>
          )}
        </div>
      </div>
      <div className={cx('border-t border-line p-[22px]', !all && 'hidden print-block')}>
        <StageTracker d={s} audit={audit} />
      </div>
      <Drawer open={!!active} onClose={() => setOpenKey(null)} title={active?.title ?? ''} subtitle={name}
        note={active ? NOTE[active.storage] : undefined} width={active && WIDE.includes(active.key) ? 'lg' : 'md'}>
        {active && (
          <div className="space-y-6">
            <p className="text-[14px] text-faint">{active.why}</p>
            <ActionForm k={active.key} s={s} user={user} goTab={(t) => { setOpenKey(null); goTab(t); }} />
          </div>
        )}
      </Drawer>
    </section>
  );
}
