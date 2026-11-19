import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, RotateCw } from 'lucide-react';
import { INSTRUMENT_DOKTOR_2025 as INST, type AiAnalysisDto, type AiItemSuggestion, type AiStatus } from '@akreditasi/shared';
import { Button, ScoreFigure, StatusDot } from '../../components/ui';
import { fmtDateTime, fmtScore } from '../../lib/labels';
import { useAiDetail, useAiList, useRerunAi } from './hooks';
import { AI_STATUS_LABEL, AiTechnical } from './parts';

export interface ScoringAi {
  latest: AiAnalysisDto | null;
  detail: AiAnalysisDto | undefined;
  loading: boolean;
  enabled: boolean;
  suggestion: (butirId: string) => AiItemSuggestion | undefined;
}

/** Data AI untuk halaman penilaian: analisis otomatis terbaru (selesai) + kutipan sumbernya. */
export function useAiForScoring(submissionId: string): ScoringAi {
  const list = useAiList(submissionId);
  const latest = list.data?.latest ?? null;
  const lastDone = list.data?.analyses.find((a) => a.status === 'done') ?? null;
  const detail = useAiDetail(lastDone?.id);
  const map = useMemo(() => new Map((lastDone?.result?.items ?? []).map((i) => [i.butirId, i])), [lastDone]);
  return { latest, detail: detail.data, loading: list.isLoading, enabled: list.data?.enabled ?? true, suggestion: (id) => map.get(id) };
}

const STATUS_TONE: Record<AiStatus, 'ok' | 'navy' | 'gray' | 'bad'> = { done: 'ok', running: 'navy', queued: 'gray', failed: 'bad' };
const critTitle = (code: string) => INST.criteria.find((c) => c.code === code)?.title ?? code;

/** Kartu "Ringkasan AI" pada kolom kanan halaman penilaian; pendukung, bukan nilai resmi. */
export function ScoringAiPanel({ submissionId, phase, ai, locked }: { submissionId: string; phase: 'AK' | 'AL'; ai: ScoringAi; locked: boolean }) {
  const rerun = useRerunAi(submissionId, phase);
  const l = ai.latest;
  const active = !!l && (l.status === 'queued' || l.status === 'running');
  const done = ai.detail && ai.detail.status === 'done' ? ai.detail : null;
  const totals = done?.totals;
  const message = !ai.enabled ? 'Layanan AI belum diaktifkan pada server ini. Penilaian tetap dapat dilakukan secara manual.'
    : ai.loading ? 'Memuat saran AI…'
    : !l ? 'Belum ada analisis. Analisis berjalan otomatis setelah LED dan LKPS terunggah dan terindeks.'
    : active ? `${l.status === 'queued' ? 'Analisis menunggu giliran' : 'Analisis sedang diproses'}; halaman diperbarui otomatis.${l.status === 'queued' && l.attempts > 0 && l.error ? ` ${l.error} Sistem akan mencoba lagi otomatis.` : ''}`
    : l.status === 'failed' ? (l.error ?? 'Layanan AI sedang tidak dapat memproses permintaan.') : 'Memuat saran AI…';
  return (
    <section className="card p-[22px]" aria-label="Ringkasan AI">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-faint">Ringkasan AI</span>
        {l && <StatusDot tone={STATUS_TONE[l.status]}>{AI_STATUS_LABEL[l.status]}</StatusDot>}
      </div>
      {done?.result ? (
        <>
          <ScoreFigure className="mt-2" value={totals?.weighted} max={totals?.scaleMax ?? INST.scale.max} />
          <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-muted">{done.result.summary || '—'}</p>
          <p className="mt-2 text-[13px] text-faint">Bukan nilai resmi · {fmtDateTime(done.finishedAt)}{l && l.id !== done.id && active ? ' · analisis yang lebih baru sedang diproses' : ''}</p>
        </>
      ) : <p className="mt-2 text-[14px] leading-relaxed text-muted">{message}</p>}
      {l?.status === 'failed' && !locked && <Button className="mt-3" variant="secondary" size="sm" icon={<RotateCw size={15} />} loading={rerun.isPending} onClick={() => rerun.mutate()}>Coba lagi</Button>}
      <details className="group mt-4 border-t border-line pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13.5px] font-semibold text-navy-700 [&::-webkit-details-marker]:hidden">
          <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden />Rincian dan analisis ulang
        </summary>
        <div className="mt-3 space-y-3 text-[13.5px]">
          {totals && (
            <ul className="space-y-1">
              {totals.perCriterion.map((c) => (
                <li key={c.code} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-muted" title={critTitle(c.code)}>{c.code.slice(1)}. {critTitle(c.code)}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{fmtScore(c.average)}</span>
                </li>
              ))}
            </ul>
          )}
          {!locked && <Button variant="secondary" size="sm" icon={<RotateCw size={15} />} loading={rerun.isPending} disabled={!ai.enabled || active} onClick={() => rerun.mutate()}>Analisis ulang</Button>}
          <p className="text-[13px] text-faint">Analisis ulang memakai kuota layanan AI yang terbatas; gunakan seperlunya.</p>
          {done && <AiTechnical a={done} />}
          <Link to={`/pengajuan/${submissionId}`} className="block font-semibold text-navy-700 hover:underline">Riwayat di halaman pengajuan</Link>
        </div>
      </details>
    </section>
  );
}
