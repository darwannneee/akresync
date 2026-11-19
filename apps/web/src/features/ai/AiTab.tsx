import { Bot, ChevronDown, RotateCw, RefreshCw } from 'lucide-react';
import { INSTRUMENT_DOKTOR_2025 as INST } from '@akreditasi/shared';
import type { SubmissionDetail, User } from '../../api/types';
import { Button, Card, EmptyState, Notice, Skeleton, StatusDot } from '../../components/ui';
import { PHASE_LABEL, fmtDateTime } from '../../lib/labels';
import { useAiDetail, useAiList, useReindex, useRerunAi } from './hooks';
import { AiBanner, AiFailedNotice, AiTechnical, ComparisonView, HistoryTable, INDEX_LABEL, SuggestionBlock, TotalsView, itemNo } from './parts';
import { AiProgressCard } from './ProgressCard';

/** Tab "Analisis AI": hasil terbaru, riwayat dan jejak teknis, perbandingan dengan skor asesor (bukan untuk UPPS). */
export function AiTab({ s, user }: { s: SubmissionDetail; user: User }) {
  const list = useAiList(s.id);
  const lastDone = list.data?.analyses.find((a) => a.status === 'done') ?? null;
  const detail = useAiDetail(lastDone?.id);
  const rerunAk = useRerunAi(s.id, 'AK');
  const rerunAl = useRerunAi(s.id, 'AL');
  const reindex = useReindex(s.id);
  if (list.isLoading) return <Skeleton className="h-40 w-full" />;
  if (list.isError) {
    return (
      <div className="space-y-5">
        <AiBanner />
        <EmptyState title="Analisis AI belum dapat ditampilkan" icon={<Bot size={22} />}>Analisis AI hanya tersedia bagi pihak yang bertugas pada pengajuan ini, atau layanan sedang tidak dapat dihubungi. Muat ulang halaman bila perlu.</EmptyState>
      </div>
    );
  }
  const d = list.data;
  const rerun = (latestPhase?: 'AK' | 'AL') => (latestPhase === 'AL' ? rerunAl : rerunAk);
  const latest = d?.latest ?? null;
  const active = latest && (latest.status === 'queued' || latest.status === 'running');
  const res = detail.data?.result ?? lastDone?.result ?? null;
  const cites = detail.data?.citations;
  const canIndex = user.role === 'kea' || user.role === 'sek_adm';
  const canRerun = user.role === 'kea';
  return (
    <div className="space-y-6">
      <AiBanner />
      {d && !d.enabled && <Notice tone="warn" title="Layanan AI sedang nonaktif">{res ? 'Analisis baru tidak dapat diminta sampai layanan diaktifkan. Hasil analisis sebelumnya tetap ditampilkan di bawah.' : 'Analisis baru tidak dapat diminta sampai layanan diaktifkan oleh administrator.'}</Notice>}
      <AiProgressCard p={s.aiProgress} />

      {d && d.index.length > 0 && user.role !== 'upps' && (
        <Card title="Status indeks dokumen" actions={canIndex ? <Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} loading={reindex.isPending} onClick={() => reindex.mutate()}>Indeks ulang dokumen</Button> : undefined}>
          <ul className="-my-1 divide-y divide-line">
            {d.index.map((i) => (
              <li key={i.documentId} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] text-ink"><span className="font-medium">{i.docType}</span> <span className="text-faint">· {i.fileName}</span></div>
                  <div className="text-[13px] text-faint">{i.chunkCount} potongan{i.embeddingDim ? ` · ${i.embeddingDim} dimensi` : ''}{i.embedModel ? ` · ${i.embedModel}` : ''}{i.indexStatus !== 'indexed' && i.total ? ` · bersemat ${i.embedded ?? 0}/${i.total}` : ''}{i.indexedAt ? ` · ${fmtDateTime(i.indexedAt)}` : ''}</div>
                  {i.indexError && <div className="text-[13px] text-bad">{i.indexError}</div>}
                </div>
                <StatusDot tone={i.indexStatus === 'indexed' ? 'ok' : i.indexStatus === 'failed' ? 'bad' : 'warn'}>{INDEX_LABEL[i.indexStatus]}</StatusDot>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {latest?.status === 'failed' && <AiFailedNotice a={latest} canRetry={canRerun && !!d?.enabled} retrying={rerun(latest.phase).isPending} onRetry={() => rerun(latest.phase).mutate()} />}
      {active && <Notice tone="info" title={latest!.status === 'queued' ? 'Analisis menunggu giliran' : 'Analisis sedang diproses'}>Halaman diperbarui otomatis.</Notice>}

      {res && lastDone ? (
        <>
          <Card title="Skor AI sementara" description={`${PHASE_LABEL[lastDone.phase] ?? lastDone.phase} · selesai ${fmtDateTime(lastDone.finishedAt)} · himpunan dokumen versi ${lastDone.setVersion ?? '—'}`} actions={<StatusDot tone="ok">Selesai</StatusDot>}>
            {lastDone.totals && <TotalsView totals={lastDone.totals} />}
            <div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-[13px] font-semibold text-muted">Ringkasan AI</p><p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{res.summary || '—'}</p></div>
            <div className="mt-4"><AiTechnical a={detail.data ?? lastDone} /></div>
          </Card>
          <Card title="Saran per butir" description="Kutipan sumber dapat dibuka pada setiap saran." flush>
            <div className="divide-y divide-line">
              {INST.criteria.filter((c) => c.scored).map((c) => (
                <details key={c.code} className="group">
                  <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-[22px] py-3 font-medium text-ink hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                    <span>Kriteria {c.code.slice(1)}. {c.title}</span><ChevronDown size={17} className="shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <ul className="space-y-5 px-[22px] pb-5 pt-1">
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
      ) : !active && latest?.status !== 'failed' && <EmptyState title="Belum ada hasil analisis AI" icon={<Bot size={22} />} action={canRerun && d?.enabled ? <div className="flex flex-wrap justify-center gap-2"><Button variant="secondary" size="sm" loading={rerunAk.isPending} onClick={() => rerunAk.mutate()}>Minta analisis AK</Button><Button variant="secondary" size="sm" loading={rerunAl.isPending} onClick={() => rerunAl.mutate()}>Minta analisis AL</Button></div> : undefined}>{d && !d.enabled ? 'Layanan AI sedang nonaktif, sehingga belum ada analisis yang dihasilkan untuk pengajuan ini.' : 'Analisis berjalan otomatis setelah LED dan LKPS terunggah dan terindeks.'}</EmptyState>}

      {user.role !== 'upps' && d && d.comparisons.length > 0 && (
        <Card title="Kesesuaian saran AI dengan skor asesor" description="Perbandingan per butir antara saran AI dan skor yang diisi atau diserahkan asesor.">
          <div className="space-y-3">{d.comparisons.map((c) => <ComparisonView key={`${c.analysisId}-${c.assessorId}`} c={c} />)}</div>
        </Card>
      )}

      {d && d.analyses.length > 0 && (
        <Card title="Riwayat analisis AI" description="Setiap analisis tersimpan beserta model, versi prompt, token, latensi, dan sidik jari hasil." actions={canRerun ? <>
            <Button variant="secondary" size="sm" icon={<RotateCw size={15} />} loading={rerunAk.isPending} disabled={!!active || !d.enabled} onClick={() => rerunAk.mutate()}>Analisis ulang AK</Button>
            <Button variant="secondary" size="sm" icon={<RotateCw size={15} />} loading={rerunAl.isPending} disabled={!!active || !d.enabled} onClick={() => rerunAl.mutate()}>Analisis ulang AL</Button>
          </> : undefined}>
          <HistoryTable rows={d.analyses} />
        </Card>
      )}
    </div>
  );
}
