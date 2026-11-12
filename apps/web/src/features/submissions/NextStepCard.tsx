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
      <section aria-label="Tindakan yang perlu dilakukan" className={`no-print card flex items-start gap-3 border-l-4 px-4 py-3 ${done ? 'border-l-ok' : 'border-l-slate-400'}`}>
        {done ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-ok" aria-hidden /> : <Hourglass size={20} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />}
        <div className="min-w-0 text-sm">
          <p className="font-medium text-ink">{done ? 'Proses selesai' : 'Belum ada tindakan untuk Bapak/Ibu'}</p>
          <p className="text-muted">{waiting}</p>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Tindakan yang perlu dilakukan" className="no-print card border-l-4 border-l-navy-700">
      <p className="border-b border-line px-4 py-2.5 text-sm font-medium text-navy-700">Tindakan yang perlu dilakukan</p>
      <ul className="divide-y divide-line">
        {actions.map((a) => (
          <li key={a.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-ink">{a.title}</span>
              <Badge tone={a.storage === 'C' ? 'chain' : 'neutral'} icon={a.storage === 'C' ? <Link2 size={12} aria-hidden /> : <Save size={12} aria-hidden />}>{a.storage === 'C' ? 'Dicatat permanen' : 'Tersimpan dengan jejak audit'}</Badge>
            </div>
            <Button size="sm" onClick={() => (a.key === 'ak_correction' ? goTab('catatan') : setOpenKey(a.key))}>{a.key === 'ak_correction' ? 'Buka Catatan Resmi' : 'Kerjakan'}</Button>
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
