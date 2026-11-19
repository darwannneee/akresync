import { useId, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { INSTRUMENT_DOKTOR_2025 as INST, weightedAverage } from '@akreditasi/shared';
import { api } from '../../api/client';
import { Button, ButtonLink, Card, Choice, Field, FormError, Notice, PageSkeleton, ScoreFigure, Textarea } from '../../components/ui';
import { useConfirmed } from '../common/forms';
import { useSubmission } from '../common/queries';
import { useAction } from '../common/useAction';
import { AK_LABEL, fmtNumber, fmtScore } from '../../lib/labels';
import { useAiForScoring } from '../ai/ScoringAiPanel';
import { ITEM_DIFF_LEVELS, ItemDiffTable, ScoreComparison } from './ScoreComparison';

type Decision = { result: string; notes: string };

/** Halaman kerja KEA: periksa konsistensi Asesmen Kecukupan dua asesor, lalu setujui atau kembalikan. */
export function ConsistencyPage() {
  const { id = '' } = useParams();
  const q = useSubmission(id);
  const ai = useAiForScoring(id);
  const [result, setResult] = useState('approved');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const cbId = useId();
  const consistency = useAction((v: Decision) => api.post(`/submissions/${id}/ak-consistency`, v), { title: 'Pemeriksaan konsistensi telah dicatat', submissionId: id });
  const s = q.data;
  const ak = (s?.assessments ?? []).filter((a) => a.phase === 'AK' && a.status === 'submitted');
  const avgs = ak.map((a) => weightedAverage(a.scores ?? {}));
  const [a0, a1] = avgs;
  const diff = avgs.length === 2 && a0 != null && a1 != null ? Math.abs(a0 - a1) : null;
  const totals = ak.map((a) => Number(a.totalScore ?? 0));
  const totalDiff = totals.length === 2 ? Math.abs(totals[0]! - totals[1]!) : null;
  const confirm = useConfirmed<Decision>({
    run: (v) => consistency.mutate(v), pending: consistency.isPending, title: 'Catat pemeriksaan konsistensi AK?', confirmLabel: 'Ya, catat pemeriksaan', permanent: false,
    summary: (v) => [['Program studi', s?.programName], ['Keputusan', v.result === 'approved' ? 'Konsisten, proses dilanjutkan' : 'Dikembalikan untuk dinilai ulang'], ['Selisih skor rata-rata berbobot', diff === null ? '—' : fmtScore(diff)], ['Selisih skor total', totalDiff === null ? '—' : fmtNumber(totalDiff)], ['Catatan untuk asesor', v.notes || '—']],
  });

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !s) return <FormError message="Pengajuan tidak dapat dimuat. Muat ulang halaman atau kembali ke daftar." />;
  if (consistency.isSuccess) return <Navigate to={`/pengajuan/${id}`} replace />;
  const back = <ButtonLink to={`/pengajuan/${id}`} variant="secondary" icon={<ChevronLeft size={16} />}>Kembali ke pengajuan</ButtonLink>;
  if (s.akStatus !== 'ak_complete') {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Notice tone="info" title="Pemeriksaan konsistensi belum atau tidak lagi diperlukan">Status Asesmen Kecukupan saat ini: {AK_LABEL[s.akStatus] ?? s.akStatus}. Pemeriksaan dibuka setelah kedua asesor menyerahkan penilaian.</Notice>
        {back}
      </div>
    );
  }

  const need = result === 'returned';
  const send = () => {
    if (need && notes.trim().length < 3) { setErr('Catatan wajib diisi untuk keputusan ini. Jelaskan alasan atau bagian yang perlu diperbaiki.'); return; }
    setErr(null);
    confirm.ask({ result, notes: notes.trim() });
  };
  const hasAi = !!ai.detail?.result;
  const pair = ak.length === 2 ? [ak[0]!, ak[1]!] as const : null;

  return (
    <div>
      <Link to={`/pengajuan/${id}`} className="text-[14px] text-faint hover:text-navy-700">{s.programName ?? `Pengajuan ${id.slice(0, 8)}`}{s.institutionName ? ` · ${s.institutionName}` : ''}</Link>
      <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Periksa konsistensi Asesmen Kecukupan</h1>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-8">
          {!pair && <Notice tone="warn" title="Hasil belum lengkap">Pemeriksaan membutuhkan hasil kedua asesor; saat ini tersedia {ak.length} hasil yang diserahkan. Muat ulang halaman bila perlu.</Notice>}
          <div className="grid gap-4 sm:grid-cols-3">
            {ak.map((a, i) => (
              <div key={a.id} className="card p-[22px]">
                <div className="truncate text-[13px] text-faint" title={a.assessorName}>{a.assessorName ?? `Asesor ${i + 1}`}</div>
                <ScoreFigure className="mt-1" value={avgs[i]} max={INST.scale.max} />
              </div>
            ))}
            {pair && (
              <div className="card p-[22px]">
                <div className="text-[13px] text-faint">Selisih</div>
                <div className="mt-1 text-[24px] font-semibold leading-none tracking-tight text-wait tabular-nums">{fmtScore(diff)}</div>
              </div>
            )}
          </div>

          {pair && (
            <Card flush title="Butir yang berbeda jauh" actions={
              <label htmlFor={cbId} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-muted">
                <input id={cbId} type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} className="h-4 w-4 accent-navy-700" />Hanya selisih ≥ {ITEM_DIFF_LEVELS}
              </label>
            }>
              <ItemDiffTable first={pair[0]} second={pair[1]} onlyFlagged={onlyFlagged} ai={hasAi ? (b) => ai.suggestion(b)?.suggestedScore : undefined} />
            </Card>
          )}

          {pair && (
            <Card title="Perbandingan per kriteria" description="Skor kriteria (jumlah skor × bobot) kedua asesor.">
              <ScoreComparison first={pair[0]} second={pair[1]} />
            </Card>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:col-span-4">
          <section className="card p-[22px]" aria-label="Keputusan">
            <h2 className="text-base font-semibold">Keputusan</h2>
            <Choice className="mt-4" name="consistency" value={result} onChange={(v) => { setResult(v); setErr(null); }}
              options={[{ value: 'approved', label: 'Konsisten, lanjutkan' }, { value: 'returned', label: 'Kembalikan untuk dinilai ulang' }]} />
            <Field className="mt-4" label="Catatan untuk asesor" required={need} hint={need ? 'Wajib diisi bila hasil dikembalikan.' : 'Opsional.'} error={err ?? undefined}>
              {(p) => <Textarea {...p} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
            <Button className="mt-4 w-full" disabled={!pair} loading={consistency.isPending} onClick={send}>Simpan keputusan</Button>
          </section>
        </aside>
      </div>
      {confirm.dialog}
    </div>
  );
}
