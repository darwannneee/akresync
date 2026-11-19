import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { AuditEventView, SubmissionDetail } from '../../api/types';
import { CopyableMono, StatusDot, TechnicalDetails, cx } from '../../components/ui';
import { STATUS_LABEL, STORAGE_NOTE, buildWorkflow, currentIndex, stageEvidence, type MainStage, type StepStatus, type SubStep } from '../../lib/workflow';
import { fmtDateTime } from '../../lib/labels';

const laneStatus = (steps: SubStep[]): StepStatus => steps.every((x) => x.status === 'selesai') ? 'selesai' : steps.some((x) => x.status === 'aktif') ? 'aktif' : steps.some((x) => x.status === 'menunggu') ? 'menunggu' : steps.every((x) => x.status === 'terkunci') ? 'terkunci' : 'aktif';
const TONE: Record<StepStatus, 'ok' | 'navy' | 'warn' | 'gray' | 'bad'> = { selesai: 'ok', aktif: 'navy', menunggu: 'warn', terkunci: 'gray', ditolak: 'bad' };
const CIRCLE: Record<StepStatus, string> = {
  selesai: 'bg-ok text-white', aktif: 'bg-navy-700 text-white ring-4 ring-navy-100', menunggu: 'bg-wait text-white', terkunci: 'border-2 border-slate-200 bg-white text-faint', ditolak: 'bg-bad text-white',
};
const Status = ({ s }: { s: StepStatus }) => <StatusDot tone={TONE[s]}>{STATUS_LABEL[s]}</StatusDot>;

function SubStepList({ steps }: { steps: SubStep[] }) {
  return (
    <ol className="divide-y divide-line rounded-xl border border-line bg-white">
      {steps.map((x) => (
        <li key={x.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className={cx('text-[14.5px] font-medium', x.status === 'terkunci' ? 'text-faint' : 'text-ink')}>{x.label}</p>
            <p className="text-[13px] text-faint">{x.roleLabel} · {x.storage === 'C' ? 'dicatat permanen' : 'tersimpan dengan jejak audit'}</p>
            {x.note && <p className="text-[13px] text-wait">{x.note}</p>}
          </div>
          <Status s={x.status} />
        </li>
      ))}
    </ol>
  );
}

function StageDetail({ stage, d, audit }: { stage: MainStage; d: SubmissionDetail; audit: AuditEventView[] }) {
  const ev = stageEvidence(d, stage.no - 1, audit);
  const tech = ev.filter((e) => e.txId).map((e, i) => [`${i + 1}. ${e.title}`, <span key={e.key} className="inline-flex flex-wrap items-center gap-2"><CopyableMono value={e.txId} head={8} tail={6} />{e.block ? <span className="text-faint">blok {e.block}</span> : null}</span>] as [string, React.ReactNode]);
  return (
    <div className="mt-6 space-y-5" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[16px] font-semibold">Langkah {stage.no}. {stage.label}</h3>
        <Status s={stage.status} />
      </div>
      <p className="-mt-3 text-[13.5px] text-faint">Penanggung jawab: {stage.roleLabel}. {STORAGE_NOTE[stage.storage]}.</p>
      {stage.lanes ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="min-w-0"><p className="mb-2 text-[14px] font-semibold text-ink">Jalur A · Penugasan asesor dan Asesmen Kecukupan</p><SubStepList steps={stage.lanes.ak} /></div>
          <div className="min-w-0"><p className="mb-2 text-[14px] font-semibold text-ink">Jalur B · Jadwal Asesmen Lapangan</p><SubStepList steps={stage.lanes.al} /></div>
          <p className="text-[13.5px] text-faint lg:col-span-2">Kedua jalur berjalan bersamaan. Langkah berikutnya dimulai setelah keduanya selesai.</p>
        </div>
      ) : <SubStepList steps={stage.steps} />}
      <div>
        <p className="mb-2 text-[14px] font-semibold text-ink">Bukti langkah ini</p>
        {ev.length === 0 ? <p className="text-[14px] text-faint">Belum ada catatan pada langkah ini.</p> : (
          <ul className="space-y-1.5 text-[14px]">
            {ev.map((e) => (
              <li key={e.key} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-ink">{e.title}</span>
                <span className="text-[13px] text-faint">{e.roleLabel} · {fmtDateTime(e.when)} · {e.kind === 'chain' || e.txId ? 'tercatat permanen' : 'sedang dicatat'}</span>
              </li>
            ))}
          </ul>
        )}
        {tech.length > 0 && <div className="mt-3 max-w-2xl"><TechnicalDetails items={tech} /></div>}
      </div>
    </div>
  );
}

/** Sembilan langkah akreditasi (tampilan tenang) beserta rincian langkah yang dipilih. */
export function StageTracker({ d, audit }: { d: SubmissionDetail; audit: AuditEventView[] }) {
  const stages = buildWorkflow(d);
  const cur = Math.min(currentIndex(d), 8);
  const [sel, setSel] = useState<number | null>(null);
  const picked = sel ?? cur;
  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <ol className="grid min-w-[860px] grid-cols-9 gap-1" aria-label="Sembilan langkah akreditasi">
          {stages.map((st, i) => {
            const active = picked === i;
            return (
              <li key={st.id} className="relative">
                {i > 0 && <span aria-hidden className={cx('absolute left-0 right-1/2 top-[18px] h-px', st.status === 'terkunci' ? 'bg-slate-200' : 'bg-ok')} />}
                {i < stages.length - 1 && <span aria-hidden className={cx('absolute left-1/2 right-0 top-[18px] h-px', stages[i + 1]!.status === 'terkunci' ? 'bg-slate-200' : 'bg-ok')} />}
                <button type="button" onClick={() => setSel(i)} aria-pressed={active} aria-current={i === cur ? 'step' : undefined}
                  className={cx('relative flex w-full flex-col items-center rounded-lg px-1 pb-2 pt-0.5 text-center transition-colors hover:bg-slate-50', active && 'bg-navy-50 hover:bg-navy-50')}>
                  <span className={cx('relative z-10 grid h-8 w-8 place-items-center rounded-full text-[13px] font-semibold', CIRCLE[st.status])}>
                    {st.status === 'selesai' ? <Check size={15} aria-hidden /> : st.status === 'ditolak' ? <X size={15} aria-hidden /> : st.no}
                  </span>
                  <span className={cx('mt-2 px-1 text-[13px] leading-snug', st.status === 'terkunci' ? 'text-faint' : 'font-medium text-ink')}>{st.short}</span>
                  {st.lanes && st.status !== 'terkunci' && st.status !== 'selesai' && (
                    <span className="mt-1 space-y-0.5 text-[12px] text-faint">
                      <span className="block">AK: {STATUS_LABEL[laneStatus(st.lanes.ak)].toLowerCase()}</span>
                      <span className="block">Jadwal: {STATUS_LABEL[laneStatus(st.lanes.al)].toLowerCase()}</span>
                    </span>
                  )}
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
