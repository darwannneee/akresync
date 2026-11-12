import { useState } from 'react';
import { Award, Check, ClipboardCheck, FileText, Gavel, Lock, MapPin, MessageSquare, ShieldCheck, Users, Wallet, X, type LucideIcon } from 'lucide-react';
import type { AuditEventView, SubmissionDetail } from '../../api/types';
import { Badge, CopyableMono, ProofBadge, StatusPill, cx } from '../../components/ui';
import { STORAGE_NOTE, buildWorkflow, currentIndex, stageEvidence, type MainStage, type StepStatus, type SubStep } from '../../lib/workflow';
import { fmtDateTime, short } from '../../lib/labels';

const ICONS: LucideIcon[] = [FileText, ClipboardCheck, Wallet, Users, MapPin, MessageSquare, ShieldCheck, Gavel, Award];
const laneStatus = (steps: SubStep[]): StepStatus => steps.every((x) => x.status === 'selesai') ? 'selesai' : steps.some((x) => x.status === 'aktif') ? 'aktif' : steps.some((x) => x.status === 'menunggu') ? 'menunggu' : steps.every((x) => x.status === 'terkunci') ? 'terkunci' : 'aktif';

const RING: Record<StepStatus, string> = {
  selesai: 'bg-ok text-white', aktif: 'bg-navy-700 text-white ring-4 ring-navy-100', menunggu: 'bg-wait text-white ring-4 ring-wait-bg', terkunci: 'bg-slate-200 text-faint', ditolak: 'bg-bad text-white ring-4 ring-bad-bg',
};
const StatusIcon = ({ s, I }: { s: StepStatus; I: LucideIcon }) => (s === 'selesai' ? <Check size={20} aria-hidden /> : s === 'ditolak' ? <X size={20} aria-hidden /> : s === 'terkunci' ? <Lock size={17} aria-hidden /> : <I size={20} aria-hidden />);

function SubStepList({ steps }: { steps: SubStep[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((x, i) => (
        <li key={x.id} className="flex items-start gap-3 rounded-lg border border-line bg-white p-3">
          <span className={cx('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold', RING[x.status].replace(/ring-\S+/g, ''))}>{x.status === 'selesai' ? <Check size={15} aria-hidden /> : i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className={cx('font-medium', x.status === 'terkunci' ? 'text-faint' : 'text-ink')}>{x.label}</p>
            <p className="text-sm text-muted">{x.roleLabel} · {x.storage === 'C' ? 'dicatat permanen' : 'tersimpan dengan jejak audit'}</p>
            {x.note && <p className="text-sm text-wait">{x.note}</p>}
          </div>
          <StatusPill status={x.status} />
        </li>
      ))}
    </ol>
  );
}

function StageDetail({ stage, d, audit }: { stage: MainStage; d: SubmissionDetail; audit: AuditEventView[] }) {
  const ev = stageEvidence(d, stage.no - 1, audit);
  return (
    <div className="mt-5 rounded-xl border border-line bg-slate-50 p-4 sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Tahap {stage.no}. {stage.label}</h3>
        <StatusPill status={stage.status} />
      </div>
      <p className="mt-1 text-sm text-muted">Penanggung jawab: {stage.roleLabel}. {STORAGE_NOTE[stage.storage]}.</p>
      <div className="mt-4">
        {stage.lanes ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div><p className="mb-2 flex items-center gap-2 font-semibold text-navy-900"><Badge tone="info">Jalur A</Badge>Penugasan asesor dan Asesmen Kecukupan</p><SubStepList steps={stage.lanes.ak} /></div>
            <div><p className="mb-2 flex items-center gap-2 font-semibold text-navy-900"><Badge tone="info">Jalur B</Badge>Jadwal Asesmen Lapangan</p><SubStepList steps={stage.lanes.al} /></div>
            <p className="text-sm text-muted lg:col-span-2">Kedua jalur berjalan bersamaan. Tahap berikutnya dimulai setelah keduanya selesai.</p>
          </div>
        ) : <SubStepList steps={stage.steps} />}
      </div>
      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold text-navy-900">Bukti tahap ini</p>
        {ev.length === 0 ? <p className="text-sm text-muted">Belum ada catatan pada tahap ini.</p> : (
          <ul className="space-y-2">
            {ev.map((e) => (
              <li key={e.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-white px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 font-medium text-ink">{e.title}</span>
                <span className="text-muted">{e.roleLabel} · {fmtDateTime(e.when)}</span>
                {e.kind === 'chain' ? <Badge tone="chain">Tercatat permanen{e.block ? ` · blok ${e.block}` : ''}</Badge> : <ProofBadge status={e.txId ? 'committed' : 'pending'} />}
                {e.txId && <CopyableMono value={e.txId} head={6} tail={4} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function StageTracker({ d, audit }: { d: SubmissionDetail; audit: AuditEventView[] }) {
  const stages = buildWorkflow(d);
  const cur = Math.min(currentIndex(d), 8);
  const [sel, setSel] = useState<number | null>(null);
  const picked = sel ?? cur;
  const doneAt = (st: MainStage) => {
    if (st.status !== 'selesai') return null;
    const ev = stageEvidence(d, st.no - 1, audit);
    return ev.length ? ev[ev.length - 1]!.when : null;
  };
  return (
    <div>
      <div className="-mx-5 overflow-x-auto px-5 pb-2">
        <ol className="grid min-w-[980px] grid-cols-9 gap-1" aria-label="Sembilan tahap akreditasi">
          {stages.map((st, i) => {
            const I = ICONS[i]!;
            const active = picked === i;
            const when = doneAt(st);
            return (
              <li key={st.id} className="relative">
                {i > 0 && <span aria-hidden className={cx('absolute left-0 right-1/2 top-[22px] h-0.5', st.status === 'terkunci' ? 'bg-slate-200' : 'bg-ok')} />}
                {i < stages.length - 1 && <span aria-hidden className={cx('absolute left-1/2 right-0 top-[22px] h-0.5', stages[i + 1]!.status === 'terkunci' ? 'bg-slate-200' : 'bg-ok')} />}
                <button type="button" onClick={() => setSel(i)} aria-pressed={active} aria-current={i === cur ? 'step' : undefined}
                  className={cx('relative flex w-full flex-col items-center rounded-lg px-1 pb-2 pt-0 text-center transition-colors hover:bg-navy-50', active && 'bg-navy-50 ring-1 ring-navy-200')}>
                  <span className={cx('relative z-10 grid h-11 w-11 place-items-center rounded-full', RING[st.status])}><StatusIcon s={st.status} I={I} /></span>
                  <span className="mt-2 text-xs font-semibold uppercase tracking-wide text-faint">Tahap {st.no}</span>
                  <span className={cx('mt-0.5 px-1 text-sm leading-snug', st.status === 'terkunci' ? 'text-faint' : 'font-semibold text-ink')}>{st.short}</span>
                  {st.lanes ? (
                    <span className="mt-2 flex w-full flex-col gap-1.5">
                      {([['Jalur A', 'Penugasan dan AK', st.lanes.ak], ['Jalur B', 'Jadwal AL', st.lanes.al]] as const).map(([k, l, steps]) => {
                        const ls = laneStatus(steps);
                        return <span key={k} className={cx('rounded-md border px-1.5 py-1 text-left text-xs leading-tight', ls === 'selesai' ? 'border-ok-line bg-ok-bg text-ok' : ls === 'aktif' ? 'border-info-line bg-info-bg text-info' : ls === 'menunggu' ? 'border-wait-line bg-wait-bg text-wait' : 'border-line bg-slate-50 text-faint')}><b>{k}</b><br />{l}</span>;
                      })}
                    </span>
                  ) : <span className="mt-1"><StatusPill status={st.status} label={st.status === 'aktif' ? 'Berjalan' : st.status === 'terkunci' ? 'Belum' : undefined} /></span>}
                  {when && <span className="mt-1 text-xs text-muted">{fmtDateTime(when).replace(/, \d.*$/, '')}</span>}
                  {st.status === 'menunggu' && st.note && <span className="text-xs text-wait">{short(st.note, 30, 0)}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <StageDetail stage={stages[picked]!} d={d} audit={audit} />
    </div>
  );
}
