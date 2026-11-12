import { CheckCircle2, Circle, Loader2, TriangleAlert } from 'lucide-react';
import type { AiProgress } from '@akreditasi/shared';
import { Card, Notice } from '../../components/ui';
import { DOC_TYPE_LABEL } from '../../lib/labels';
import { INDEX_LABEL, PHASE_PROGRESS_LABEL } from './parts';

function Step({ done, active, children }: { done?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {done ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden /> : active ? <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-navy-700" aria-hidden /> : <Circle size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden />}
      <span className={done ? 'text-ink' : 'text-muted'}>{children}</span>
    </li>
  );
}

/** Progres pemrosesan AI atas dokumen. Aman untuk UPPS (tanpa skor/justifikasi). */
export function AiProgressCard({ p }: { p?: AiProgress }) {
  if (!p?.enabled) return null;
  const allIndexed = p.documents.length === 2 && p.documents.every((d) => d.indexStatus === 'indexed');
  const analysisDone = p.analysis?.status === 'done';
  return (
    <Card title="Pemrosesan AI atas dokumen" description="Berjalan otomatis setelah LED dan LKPS terunggah. Tidak memengaruhi pengiriman pengajuan resmi.">
      <ul className="space-y-2">
        {(['LED', 'LKPS'] as const).map((t) => {
          const d = p.documents.find((x) => x.docType === t);
          return (
            <li key={t} className="rounded-lg border border-line px-3 py-2.5">
              <p className="text-sm font-medium text-ink">{DOC_TYPE_LABEL[t] ?? t}{d ? <span className="font-normal text-muted"> · {d.fileName}</span> : <span className="font-normal text-muted"> · belum diunggah</span>}</p>
              {d && (
                <ul className="mt-1.5 space-y-1">
                  <Step done={d.check?.status === 'verified'} active={false}>Diperiksa jenis dokumennya: {d.check?.status === 'verified' ? 'sesuai' : d.check?.status === 'mismatch' ? 'perlu diperiksa kembali' : 'verifikasi jenis tertunda (akan dicoba ulang otomatis)'}</Step>
                  <Step done={d.indexStatus === 'indexed'} active={d.indexStatus === 'indexing'}>Diindeks: {d.indexStatus === 'indexing' || (d.indexStatus === 'pending' && d.total) ? `Diindeks ${d.embedded ?? 0}/${d.total ?? '…'} bagian` : INDEX_LABEL[d.indexStatus]}</Step>
                </ul>
              )}
              {d?.check?.status === 'mismatch' && <div className="mt-2"><Notice tone="warn" title="Jenis dokumen perlu diperiksa">{d.check.reason ?? 'Isi berkas tidak tampak sesuai jenis yang dipilih.'}</Notice></div>}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm">
        {p.phase === 'failed' ? <TriangleAlert size={16} className="text-bad" aria-hidden /> : analysisDone ? <CheckCircle2 size={16} className="text-ok" aria-hidden /> : <Loader2 size={16} className={p.phase === 'waiting_documents' ? 'hidden' : 'animate-spin text-navy-700'} aria-hidden />}
        <span><b>Analisis AI:</b> {p.analysis ? ({ queued: 'antre', running: 'diproses', done: 'selesai', failed: 'gagal' } as const)[p.analysis.status] : allIndexed ? 'antre' : '—'} <span className="text-muted">({PHASE_PROGRESS_LABEL[p.phase]})</span></span>
      </div>
      <p className="mt-2 text-xs text-faint">Setiap himpunan dokumen memakai hingga 3 panggilan layanan AI (2 pemeriksaan jenis dan 1 analisis). Verifikasi jenis yang tertunda tidak menghalangi unggahan.</p>
    </Card>
  );
}
