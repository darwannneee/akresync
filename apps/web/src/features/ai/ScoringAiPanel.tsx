import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { RotateCw } from 'lucide-react';
import type { AiAnalysisDto, AiItemSuggestion } from '@akreditasi/shared';
import { Button, Card, Notice } from '../../components/ui';
import { fmtDateTime } from '../../lib/labels';
import { useAiDetail, useAiList, useRerunAi } from './hooks';
import { AiBanner, AiFailedNotice, AiStatusBadge, AiTechnical, TotalsView } from './parts';

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

export function ScoringAiPanel({ submissionId, phase, ai, locked }: { submissionId: string; phase: 'AK' | 'AL'; ai: ScoringAi; locked: boolean }) {
  const rerun = useRerunAi(submissionId, phase);
  const l = ai.latest;
  const active = l && (l.status === 'queued' || l.status === 'running');
  const done = ai.detail && ai.detail.status === 'done' ? ai.detail : null;
  return (
    <Card title="Saran AI — pendukung keputusan" description="Dibuat otomatis dari LED dan LKPS yang diunggah UPPS. Bapak/Ibu tetap menilai dan menyerahkan skor sendiri."
      actions={l ? <AiStatusBadge status={l.status} /> : undefined}>
      <div className="space-y-4">
        <AiBanner />
        {!ai.enabled && <Notice tone="info">Layanan AI belum diaktifkan pada server ini. Penilaian tetap dapat dilakukan secara manual.</Notice>}
        {ai.loading && <p className="text-sm text-muted">Memuat saran AI…</p>}
        {!ai.loading && ai.enabled && !l && <Notice tone="info" title="Belum ada analisis AI">Analisis berjalan otomatis setelah LED dan LKPS terunggah dan terindeks. Bila belum muncul, gunakan Analisis ulang di bawah.</Notice>}
        {active && (
          <Notice tone="info" title={l!.status === 'queued' ? 'Analisis AI menunggu giliran' : 'Analisis AI sedang diproses'}>
            Halaman diperbarui otomatis; biasanya selesai dalam beberapa menit.{l!.status === 'queued' && l!.attempts > 0 && l!.error ? ` ${l!.error} Sistem akan mencoba lagi otomatis.` : ''}
          </Notice>
        )}
        {l?.status === 'failed' && <AiFailedNotice a={l} canRetry={!locked} retrying={rerun.isPending} onRetry={() => rerun.mutate()} />}
        {done?.result && (
          <>
            <p className="text-xs text-muted">Analisis selesai {fmtDateTime(done.finishedAt)} · himpunan dokumen versi {done.setVersion ?? '—'}{ai.latest && ai.latest.id !== done.id && active ? ' · analisis yang lebih baru sedang diproses' : ''}</p>
            {done.totals && <TotalsView totals={done.totals} />}
            <div className="rounded-lg border border-line bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-faint">Ringkasan AI</p><p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{done.result.summary || '—'}</p></div>
            <p className="text-sm text-muted">Saran per butir tampil di bawah setiap butir pada kriteria di bawah ini. Tombol “Pakai saran” hanya mengisi draf; Bapak/Ibu tetap menyerahkan hasil sendiri.</p>
            <AiTechnical a={done} />
          </>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          {!locked && <Button variant="secondary" size="sm" icon={<RotateCw size={15} />} loading={rerun.isPending} disabled={!ai.enabled || !!active} onClick={() => rerun.mutate()}>Analisis ulang</Button>}
          <span className="text-xs text-muted">Analisis ulang memakai kuota layanan AI yang terbatas; gunakan seperlunya.</span>
          <Link to={`/pengajuan/${submissionId}`} className="ml-auto text-sm text-navy-700 hover:underline">Riwayat dan rincian di halaman pengajuan</Link>
        </div>
      </div>
    </Card>
  );
}
