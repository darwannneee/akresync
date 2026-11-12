import { useState } from 'react';
import { CheckCircle2, Hourglass, Link2, Save } from 'lucide-react';
import type { SubmissionDetail, User } from '../../api/types';
import { Badge, Button, Modal } from '../../components/ui';
import { nextActions, type ActionKey } from '../../lib/workflow';
import { ActionForm } from './ActionForm';
import type { DetailTab } from './types';

/** Kartu ringkas "Tindakan yang perlu dilakukan". Formulir tindakan dibuka dalam modal. */
export function NextStepCard({ s, user, goTab }: { s: SubmissionDetail; user: User; goTab: (t: DetailTab) => void }) {
  const { actions, waiting, finished } = nextActions(s, user);
  const [openKey, setOpenKey] = useState<ActionKey | null>(null);
  const active = actions.find((a) => a.key === openKey) ?? null;
  if (!actions.length) {
    const done = finished && s.stage === 'released';
    return (
      <section id="tindakan" aria-label="Tindakan yang perlu dilakukan" className="no-print card flex items-start gap-4 p-5">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${done ? 'bg-ok-bg text-ok' : 'bg-slate-100 text-slate-500'}`} aria-hidden>{done ? <CheckCircle2 size={22} /> : <Hourglass size={22} />}</span>
        <div className="min-w-0 text-sm">
          <p className="text-base font-semibold text-ink">{done ? 'Proses selesai' : 'Belum ada tindakan untuk Bapak/Ibu'}</p>
          <p className="text-muted">{waiting}</p>
        </div>
      </section>
    );
  }
  return (
    <section id="tindakan" aria-label="Tindakan yang perlu dilakukan" className="no-print scroll-mt-24 overflow-hidden rounded-xl border border-navy-200 bg-navy-50/60 shadow-card">
      <p className="flex items-center gap-2 border-b border-navy-100 bg-navy-50 px-5 py-3 text-base font-semibold text-navy-900"><span aria-hidden className="h-2 w-2 rounded-full bg-navy-700" />Tindakan yang perlu dilakukan</p>
      <ul className="divide-y divide-navy-100 bg-white">
        {actions.map((a) => (
          <li key={a.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[15px] font-semibold text-ink">{a.title}</span>
              <Badge tone={a.storage === 'C' ? 'chain' : 'neutral'} icon={a.storage === 'C' ? <Link2 size={12} aria-hidden /> : <Save size={12} aria-hidden />}>{a.storage === 'C' ? 'Dicatat permanen' : 'Tersimpan dengan jejak audit'}</Badge>
            </div>
            <Button onClick={() => (a.key === 'ak_correction' ? goTab('catatan') : setOpenKey(a.key))}>{a.key === 'ak_correction' ? 'Buka Catatan Resmi' : 'Kerjakan'}</Button>
          </li>
        ))}
      </ul>
      <Modal open={!!active} onClose={() => setOpenKey(null)} wide title={active?.title ?? ''}>
        {active && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{active.why}</p>
            <ActionForm k={active.key} s={s} user={user} goTab={(t) => { setOpenKey(null); goTab(t); }} />
          </div>
        )}
      </Modal>
    </section>
  );
}
