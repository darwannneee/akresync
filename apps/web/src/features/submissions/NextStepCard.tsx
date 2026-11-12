import { CheckCircle2, Hourglass, Link2, ListChecks, Save } from 'lucide-react';
import type { SubmissionDetail, User } from '../../api/types';
import { Badge, cx } from '../../components/ui';
import { nextActions } from '../../lib/workflow';
import { ActionForm } from './ActionForm';
import type { DetailTab } from './types';

export function NextStepCard({ s, user, goTab }: { s: SubmissionDetail; user: User; goTab: (t: DetailTab) => void }) {
  const { actions, waiting, finished } = nextActions(s, user);
  if (!actions.length) {
    const done = finished && s.stage === 'released';
    return (
      <section aria-label="Langkah berikutnya" className="no-print flex items-start gap-4 rounded-xl border border-line bg-white p-5 shadow-card">
        <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-full', done ? 'bg-ok-bg text-ok' : 'bg-slate-100 text-muted')}>{done ? <CheckCircle2 size={22} aria-hidden /> : <Hourglass size={22} aria-hidden />}</span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Langkah Bapak/Ibu berikutnya</p>
          <p className="mt-1 font-display text-lg font-semibold text-navy-900">{done ? 'Proses selesai' : 'Belum ada tindakan untuk Bapak/Ibu'}</p>
          <p className="mt-0.5 text-base text-muted">{waiting}</p>
        </div>
      </section>
    );
  }
  return (
    <div className="no-print space-y-4">
      {actions.map((a, i) => (
        <section key={a.key} aria-label="Langkah berikutnya" className="overflow-hidden rounded-xl border-2 border-navy-700 bg-white shadow-card">
          <header className="border-b border-navy-100 bg-navy-50 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-navy-700"><ListChecks size={15} aria-hidden />Langkah Bapak/Ibu berikutnya{actions.length > 1 ? ` (${i + 1} dari ${actions.length})` : ''}</span>
              <Badge tone={a.storage === 'C' ? 'chain' : 'neutral'} icon={a.storage === 'C' ? <Link2 size={13} aria-hidden /> : <Save size={13} aria-hidden />}>{a.storage === 'C' ? 'Dicatat permanen' : 'Tersimpan dengan jejak audit'}</Badge>
            </div>
            <h2 className="mt-1.5 text-xl font-bold">{a.title}</h2>
            <p className="mt-1 text-base text-slate-700">{a.why}</p>
          </header>
          <div className="p-5"><ActionForm k={a.key} s={s} user={user} goTab={goTab} /></div>
        </section>
      ))}
    </div>
  );
}
