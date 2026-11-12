import { useState, type ReactNode } from 'react';
import { Bot, CheckCircle2, Clock, FileSearch, Loader2, XCircle } from 'lucide-react';
import type { AiAnalysisDto, AiCitation, AiComparison, AiItemSuggestion, AiProgress, AiStatus, AiTotals } from '@akreditasi/shared';
import { INSTRUMENT_DOKTOR_2025 as INST } from '@akreditasi/shared';
import { Badge, CopyableMono, DataTable, Notice, TechnicalDetails } from '../../components/ui';
import { fmtDateTime, fmtNumber } from '../../lib/labels';

export const AI_TITLE = 'Hasil analisis AI (pendukung, bukan nilai resmi)';
export const AI_DISCLAIMER = 'Saran AI bersifat pendukung; skor resmi ditetapkan asesor.';

export const AI_STATUS_LABEL: Record<AiStatus, string> = { queued: 'Antre', running: 'Sedang diproses', done: 'Selesai', failed: 'Gagal' };
export const CONFIDENCE_LABEL = { low: 'Keyakinan rendah', medium: 'Keyakinan sedang', high: 'Keyakinan tinggi' } as const;
export const PHASE_PROGRESS_LABEL: Record<AiProgress['phase'], string> = {
  waiting_documents: 'Menunggu LED dan LKPS diunggah',
  checking: 'Memeriksa jenis dokumen',
  indexing: 'Mengindeks isi dokumen',
  analyzing: 'Analisis AI sedang disiapkan atau diproses',
  done: 'Analisis AI selesai',
  failed: 'Analisis AI gagal',
};
export const INDEX_LABEL = { pending: 'Menunggu', indexing: 'Sedang diindeks', indexed: 'Diindeks', failed: 'Gagal diindeks', skipped: 'Tidak diindeks' } as const;

export function AiStatusBadge({ status }: { status: AiStatus }) {
  if (status === 'done') return <Badge tone="success" icon={<CheckCircle2 size={13} aria-hidden />}>{AI_STATUS_LABEL.done}</Badge>;
  if (status === 'failed') return <Badge tone="danger" icon={<XCircle size={13} aria-hidden />}>{AI_STATUS_LABEL.failed}</Badge>;
  if (status === 'running') return <Badge tone="info" icon={<Loader2 size={13} className="animate-spin" aria-hidden />}>{AI_STATUS_LABEL.running}</Badge>;
  return <Badge tone="warn" icon={<Clock size={13} aria-hidden />}>{AI_STATUS_LABEL.queued}</Badge>;
}

export function AiBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-navy-700/20 bg-navy-50 px-4 py-3">
      <Bot size={20} className="mt-0.5 shrink-0 text-navy-700" aria-hidden />
      <div className="min-w-0 text-sm"><p className="font-semibold text-navy-900">{AI_TITLE}</p><p className="text-slate-700">{AI_DISCLAIMER}</p>{children}</div>
    </div>
  );
}

export function modelNote(a: AiAnalysisDto): string {
  const used = a.usedModel ?? a.modelVersion ?? '—';
  return a.fallbacks.length > 0 && a.requestedModel && a.usedModel !== a.requestedModel ? `${used} (cadangan dari ${a.requestedModel})` : used;
}

export function AiTechnical({ a }: { a: AiAnalysisDto }) {
  return (
    <TechnicalDetails items={[
      ['Model yang digunakan', modelNote(a)],
      ['Versi model (respons)', a.modelVersion],
      ['Percobaan model cadangan', a.fallbacks.length ? a.fallbacks.map((f) => `${f.model}: ${f.code}`).join('; ') : undefined],
      ['Versi prompt', a.promptVersion],
      ['Sidik jari templat prompt', a.promptTemplateSha256 ? <CopyableMono key="p" value={a.promptTemplateSha256} full /> : undefined],
      ['Model embedding retrieval', a.embeddingModel],
      ['Tingkat penalaran', a.thinkingLevel],
      ['Himpunan dokumen', a.setVersion ? `Versi ${a.setVersion}` : undefined],
      ['Token masuk / keluar', a.inputTokens != null ? `${fmtNumber(a.inputTokens, 0)} / ${fmtNumber(a.outputTokens ?? 0, 0)}` : undefined],
      ['Latensi', a.latencyMs != null ? `${fmtNumber(a.latencyMs / 1000, 1)} detik` : undefined],
      ['Potongan sumber dikirim', a.retrievedCount || undefined],
      ['Sitasi tidak valid dibuang', a.droppedCitations || undefined],
      ['Sidik jari hasil (SHA-256)', a.resultSha256 ? <CopyableMono key="r" value={a.resultSha256} full /> : undefined],
      ['Pencatatan audit', a.auditStatus ? (a.auditStatus === 'committed' ? 'Tercatat permanen' : a.auditStatus === 'pending' ? 'Sedang dicatat' : 'Gagal, akan dicoba ulang') : undefined],
      ['Nomor transaksi audit', a.auditTxId ? <CopyableMono key="t" value={a.auditTxId} full /> : undefined],
    ]} />
  );
}

export function TotalsView({ totals }: { totals: AiTotals }) {
  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div><div className="text-xs font-semibold uppercase tracking-wide text-faint">Skor AI sementara</div><div className="font-display text-3xl font-bold leading-none tabular-nums text-navy-900">{fmtNumber(totals.total)}</div><div className="mt-1 text-xs text-muted">dari {fmtNumber(totals.max)} · {totals.answered} dari {totals.itemCount} butir mendapat saran</div></div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-faint"><th className="py-1 pr-3 font-semibold">Kriteria</th><th className="py-1 pr-3 text-right font-semibold">Skor AI</th><th className="py-1 pr-3 text-right font-semibold">Maksimum</th><th className="py-1 text-right font-semibold">Butir bersaran</th></tr></thead>
          <tbody className="divide-y divide-line">
            {totals.perCriterion.map((c) => (
              <tr key={c.code}><td className="py-1.5 pr-3">Kriteria {c.code.slice(1)}. {INST.criteria.find((x) => x.code === c.code)?.title}</td><td className="py-1.5 pr-3 text-right tabular-nums font-medium">{fmtNumber(c.subtotal)}</td><td className="py-1.5 pr-3 text-right tabular-nums text-muted">{fmtNumber(c.max)}</td><td className="py-1.5 text-right tabular-nums text-muted">{c.filled} / {c.count}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const itemNo = (butirId: string): string => {
  const it = INST.items.find((i) => i.id === butirId);
  return it ? (it.sub ? `${it.no}.${it.sub}` : String(it.no)) : butirId;
};

function CitationList({ ids, citations }: { ids: string[]; citations?: AiCitation[] }) {
  if (!ids.length) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {ids.map((id) => {
        const c = citations?.find((x) => x.chunkId === id);
        return (
          <li key={id} className="rounded-md border border-line bg-white">
            <details>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-sm text-navy-700 [&::-webkit-details-marker]:hidden"><FileSearch size={14} aria-hidden />{c ? `${c.docType}, ${c.locator}` : 'Sumber'}<span className="text-xs text-faint">(buka kutipan)</span></summary>
              <div className="border-t border-line px-3 py-2 text-sm text-slate-700">
                {c?.excerpt ? <p className="whitespace-pre-wrap break-words leading-relaxed">{c.excerpt}</p> : <p className="text-faint">Kutipan tidak tersedia.</p>}
                {c && <p className="mt-2 text-xs text-faint">Sidik jari potongan: <code className="font-mono">{c.textSha256.slice(0, 16)}…</code></p>}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

/** Satu saran butir: skor, keyakinan, justifikasi, sitasi yang bisa dibuka, dan tombol opsional. */
export function SuggestionBlock({ item, citations, action, compact }: { item: AiItemSuggestion; citations?: AiCitation[]; action?: ReactNode; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const tone = item.confidence === 'high' ? 'success' : item.confidence === 'medium' ? 'info' : 'neutral';
  return (
    <div className="rounded-lg border border-navy-700/20 bg-navy-50/60 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-900"><Bot size={15} aria-hidden />Saran AI:</span>
        {item.suggestedScore === null ? <Badge tone="warn">Bukti tidak ditemukan, tanpa saran skor</Badge> : <span className="rounded-md bg-navy-700 px-2.5 py-0.5 font-display text-base font-bold text-white tabular-nums">{item.suggestedScore}</span>}
        <Badge tone={tone}>{CONFIDENCE_LABEL[item.confidence]}</Badge>
        <span className="ml-auto flex items-center gap-2">
          {action}
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-sm text-navy-700 underline-offset-2 hover:underline">{open ? 'Sembunyikan alasan' : 'Lihat alasan'}</button>
        </span>
      </div>
      {open && (
        <div className="mt-2">
          <p className="text-[15px] leading-relaxed text-ink">{item.justification || '—'}</p>
          <CitationList ids={item.citations} citations={citations} />
        </div>
      )}
    </div>
  );
}

const KIND_LABEL = { same: 'Sama', different: 'Berbeda', no_suggestion: 'Tanpa saran AI', no_final: 'Belum ada skor asesor' } as const;

export function ComparisonView({ c }: { c: AiComparison }) {
  const s = c.summary;
  const diffs = c.items.filter((i) => i.kind === 'different');
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="font-semibold text-ink">{c.assessorName ?? 'Asesor'} · {c.phase === 'AK' ? 'Asesmen Kecukupan' : 'Asesmen Lapangan'} · {c.finalStatus === 'submitted' ? 'skor telah diserahkan' : c.finalStatus === 'draft' ? 'skor masih draf' : 'belum ada skor'}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <Badge tone="success">{KIND_LABEL.same}: {s.same}</Badge>
        <Badge tone="warn">{KIND_LABEL.different}: {s.different}</Badge>
        <Badge tone="neutral">{KIND_LABEL.no_suggestion}: {s.noSuggestion}</Badge>
        <Badge tone="neutral">{KIND_LABEL.no_final}: {s.noFinal}</Badge>
      </div>
      {diffs.length > 0 && (
        <details className="mt-3"><summary className="cursor-pointer text-sm text-navy-700">Lihat butir yang berbeda ({diffs.length})</summary>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{diffs.map((d) => <li key={d.butirId}>Butir {itemNo(d.butirId)}: saran AI {d.suggested}, skor asesor {d.final}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

export function HistoryTable({ rows }: { rows: AiAnalysisDto[] }) {
  return (
    <DataTable rows={rows} rowKey={(a) => a.id} caption="Riwayat analisis AI" columns={[
      { key: 'w', header: 'Waktu', primary: true, cell: (a) => fmtDateTime(a.finishedAt ?? a.createdAt) },
      { key: 'j', header: 'Jenis', cell: (a) => <span className="text-sm">{a.trigger === 'auto' ? 'Otomatis' : 'Analisis ulang'} · {a.phase}<br /><span className="text-muted">Himpunan dokumen versi {a.setVersion ?? '—'}</span></span> },
      { key: 's', header: 'Status', cell: (a) => <div className="space-y-1"><AiStatusBadge status={a.status} />{a.status !== 'done' && a.error && <p className="max-w-xs text-xs text-muted">{a.error}</p>}{a.status === 'queued' && a.attempts > 0 && <p className="text-xs text-muted">Percobaan ke-{a.attempts}, akan dicoba lagi otomatis.</p>}</div> },
      { key: 'k', header: 'Skor AI', align: 'right', cell: (a) => (a.totals ? <b className="tabular-nums">{fmtNumber(a.totals.total)}</b> : '—') },
      { key: 't', header: 'Rincian teknis', cell: (a) => <AiTechnical a={a} /> },
    ]} />
  );
}

export function AiFailedNotice({ a, onRetry, retrying, canRetry }: { a: AiAnalysisDto; onRetry?: () => void; retrying?: boolean; canRetry?: boolean }) {
  return (
    <Notice tone="danger" title="Analisis AI belum berhasil">
      <p>{a.error ?? 'Layanan AI sedang tidak dapat memproses permintaan.'}</p>
      {canRetry && onRetry && <button type="button" disabled={retrying} onClick={onRetry} className="mt-2 inline-flex h-9 items-center rounded-lg border border-navy-700 bg-white px-3 text-sm font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-50">Coba lagi</button>}
    </Notice>
  );
}
