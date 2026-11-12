import { RotateCw, RefreshCw } from 'lucide-react';
import { INSTRUMENT_DOKTOR_2025 as INST } from '@akreditasi/shared';
import type { SubmissionDetail, User } from '../../api/types';
import { Badge, Button, Card, EmptyState, Notice, Skeleton } from '../../components/ui';
import { fmtDateTime } from '../../lib/labels';
import { useAiDetail, useAiList, useReindex, useRerunAi } from './hooks';
import { AiBanner, AiFailedNotice, AiStatusBadge, AiTechnical, ComparisonView, HistoryTable, INDEX_LABEL, SuggestionBlock, TotalsView, itemNo } from './parts';
import { AiProgressCard } from './ProgressCard';

/** Tab "Analisis AI": hasil terbaru, riwayat dan jejak teknis, perbandingan dengan skor asesor (bukan untuk UPPS). */
export function AiTab({ s, user }: { s: SubmissionDetail; user: User }) {
  const list = useAiList(s.id);
  const lastDone = list.data?.analyses.find((a) => a.status === 'done') ?? null;
  const detail = useAiDetail(lastDone?.id);
  const rerun = useRerunAi(s.id, 'AK');
  const reindex = useReindex(s.id);
  if (list.isLoading) return <Skeleton className="h-40 w-full" />;
  const d = list.data;
  const latest = d?.latest ?? null;
  const active = latest && (latest.status === 'queued' || latest.status === 'running');
  const res = detail.data?.result ?? lastDone?.result ?? null;
  const cites = detail.data?.citations;
  const canIndex = user.role === 'kea' || user.role === 'sek_adm';
  const canRerun = user.role === 'kea';
  return (
    <div className="space-y-5">
      <AiBanner />
      {d && !d.enabled && <Notice tone="info">Layanan AI belum diaktifkan pada server ini.</Notice>}
      <AiProgressCard p={s.aiProgress} />

      {d && d.index.length > 0 && user.role !== 'upps' && (
        <Card title="Status indeks dokumen" actions={canIndex ? <Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} loading={reindex.isPending} onClick={() => reindex.mutate()}>Indeks ulang dokumen</Button> : undefined}>
          <ul className="divide-y divide-line text-sm">
            {d.index.map((i) => (
              <li key={i.documentId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <b>{i.docType}</b><span className="min-w-0 truncate text-muted">{i.fileName}</span>
                <Badge tone={i.indexStatus === 'indexed' ? 'success' : i.indexStatus === 'failed' ? 'danger' : 'warn'}>{INDEX_LABEL[i.indexStatus]}</Badge>
                <span className="text-muted">{i.chunkCount} potongan{i.embeddingDim ? ` · ${i.embeddingDim} dimensi` : ''}{i.embedModel ? ` · ${i.embedModel}` : ''}{i.indexStatus !== 'indexed' && i.total ? ` · bersemat ${i.embedded ?? 0}/${i.total}` : ''}{i.indexedAt ? ` · ${fmtDateTime(i.indexedAt)}` : ''}</span>
                {i.indexError && <span className="w-full text-bad">{i.indexError}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {latest?.status === 'failed' && <AiFailedNotice a={latest} canRetry={canRerun} retrying={rerun.isPending} onRetry={() => rerun.mutate()} />}
      {active && <Notice tone="info" title={latest!.status === 'queued' ? 'Analisis menunggu giliran' : 'Analisis sedang diproses'}>Halaman diperbarui otomatis.</Notice>}

      {res && lastDone ? (
        <>
          <Card title="Skor AI sementara" description={`Analisis selesai ${fmtDateTime(lastDone.finishedAt)} · himpunan dokumen versi ${lastDone.setVersion ?? '—'}`} actions={<AiStatusBadge status="done" />}>
            {lastDone.totals && <TotalsView totals={lastDone.totals} />}
            <div className="mt-4 rounded-lg border border-line bg-white p-3"><p className="text-xs font-medium text-faint">Ringkasan AI</p><p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{res.summary || '—'}</p></div>
            <div className="mt-4"><AiTechnical a={detail.data ?? lastDone} /></div>
          </Card>
          <Card title="Saran per butir" description="Kutipan sumber dapat dibuka pada setiap saran.">
            <div className="space-y-3">
              {INST.criteria.filter((c) => c.scored).map((c) => (
                <details key={c.code} className="rounded-lg border border-line">
                  <summary className="cursor-pointer px-4 py-3 font-medium text-ink">Kriteria {c.code.slice(1)}. {c.title}</summary>
                  <ul className="space-y-4 border-t border-line p-4">
                    {res.items.filter((i) => i.criterion === c.code).map((it) => {
                      const meta = INST.items.find((x) => x.id === it.butirId);
                      return <li key={it.butirId}><p className="mb-1.5 text-[15px] font-medium text-ink">Butir {itemNo(it.butirId)}. {meta?.element}</p><SuggestionBlock item={it} citations={cites} compact /></li>;
                    })}
                  </ul>
                </details>
              ))}
            </div>
          </Card>
        </>
      ) : !active && latest?.status !== 'failed' && <EmptyState title="Belum ada hasil analisis AI">Analisis berjalan otomatis setelah LED dan LKPS terunggah dan terindeks.</EmptyState>}

      {user.role !== 'upps' && d && d.comparisons.length > 0 && (
        <Card title="Kesesuaian saran AI dengan skor asesor" description="Perbandingan per butir antara saran AI dan skor yang diisi atau diserahkan asesor.">
          <div className="space-y-3">{d.comparisons.map((c) => <ComparisonView key={`${c.analysisId}-${c.assessorId}`} c={c} />)}</div>
        </Card>
      )}

      {d && d.analyses.length > 0 && (
        <Card title="Riwayat analisis AI" description="Setiap analisis tersimpan beserta model, versi prompt, token, latensi, dan sidik jari hasil." actions={canRerun ? <Button variant="secondary" size="sm" icon={<RotateCw size={15} />} loading={rerun.isPending} disabled={!!active} onClick={() => rerun.mutate()}>Analisis ulang</Button> : undefined}>
          <HistoryTable rows={d.analyses} />
        </Card>
      )}
    </div>
  );
}
