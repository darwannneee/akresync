import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CircleDot, Save } from 'lucide-react';
import { ROLE_HOME } from '@akreditasi/shared';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, ConfirmDialog, FormError, Notice, PageHeader, PageSkeleton, ProgressBar, StepIndicator, cx } from '../../components/ui';
import { useSubmission } from '../common/queries';
import { useAction } from '../common/useAction';
import { ASSESS_STATUS_LABEL, PHASE_LABEL, fmtNumber } from '../../lib/labels';
import { INSTRUMENT_DOKTOR_2025 as INST, MAX_TOTAL_SCORE, computeTotal, criterionSummary, provisionalRank, type CriterionCode, type InstrumentItem, type InstrumentScores } from '@akreditasi/shared';
import { rankLabel } from '../../lib/labels';
import { SuggestionBlock } from '../ai/parts';
import { ScoringAiPanel, useAiForScoring } from '../ai/ScoringAiPanel';

const CRITERIA = INST.criteria.filter((c) => c.scored);
const SCORED = INST.items.filter((i) => CRITERIA.some((c) => c.code === i.criterion));
const ITEM_COUNT = SCORED.length;
const MAX_ITEM = INST.scale.max;
const itemLabel = (i: InstrumentItem) => (i.sub ? `${i.no}.${i.sub}` : String(i.no));
const countFilled = (s: InstrumentScores) => SCORED.filter((i) => typeof s[i.criterion]?.[i.id] === 'number').length;

export function ScoringPage() {
  const { id = '', phase: ph = 'AK' } = useParams();
  const phase = ph === 'AL' ? 'AL' : 'AK';
  const { user } = useAuth();
  const q = useSubmission(id);
  const qc = useQueryClient();
  const toast = useToast();
  const [scores, setScores] = useState<InstrumentScores>({});
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState<CriterionCode>('K1');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [confirm, setConfirm] = useState(false);
  const latest = useRef(scores);
  latest.current = scores;
  const ai = useAiForScoring(id);
  const mine = q.data?.assessments?.find((a) => a.phase === phase && a.assessorId === user?.id);

  useEffect(() => {
    if (loaded || !q.data) return;
    const base: InstrumentScores = {};
    const known = new Set(SCORED.map((i) => `${i.criterion}/${i.id}`));
    for (const [c, items] of Object.entries(mine?.scores ?? {})) for (const [k, v] of Object.entries(items)) if (known.has(`${c}/${k}`) && typeof v === 'number') (base[c] ??= {})[k] = v;
    setScores(base); setLoaded(true);
    if (mine) setSavedAt(new Date());
  }, [q.data, mine, loaded]);

  const saveDraft = useMutation({
    mutationFn: () => api.put(`/submissions/${id}/assessments/${phase}/draft`, { scores: latest.current }),
    onSuccess: () => { setDirty(false); setSavedAt(new Date()); void qc.invalidateQueries({ queryKey: ['submission', id] }); void qc.invalidateQueries({ queryKey: ['audit', id] }); },
    onError: (e) => toast.error(`Draf belum tersimpan. ${errorMessage(e)}`),
  });
  const submit = useAction(() => api.post(`/submissions/${id}/assessments/${phase}/submit`), { title: `Penilaian ${PHASE_LABEL[phase]} telah diserahkan`, submissionId: id });

  const locked = mine?.status === 'submitted';
  const total = computeTotal(scores);
  const filled = countFilled(scores);
  const count = ITEM_COUNT;
  const complete = filled === count;
  const rank = provisionalRank(total);

  // Simpan draf otomatis 2,5 detik setelah perubahan terakhir.
  const mutate = saveDraft.mutate;
  useEffect(() => {
    if (!dirty || locked || !loaded || countFilled(scores) === 0) return;
    const t = setTimeout(() => mutate(), 2500);
    return () => clearTimeout(t);
  }, [scores, dirty, locked, loaded, mutate]);

  const pick = useCallback((c: string, k: string, n: number) => {
    setScores((s) => ({ ...s, [c]: { ...s[c], [k]: n } })); setDirty(true);
  }, []);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <FormError message="Pengajuan tidak dapat dimuat. Muat ulang halaman atau kembali ke daftar." />;
  if (submit.isSuccess) return <Navigate to={`/pengajuan/${id}`} replace />;

  const crit = CRITERIA.find((c) => c.code === active) ?? CRITERIA[0]!;
  const critItems = SCORED.filter((i) => i.criterion === crit.code);
  const sendNow = async () => {
    try { if (dirty || !mine) await saveDraft.mutateAsync(); } catch { setConfirm(false); return; }
    submit.mutate(undefined);
  };
  const status = saveDraft.isPending ? 'Menyimpan draf…' : dirty ? 'Perubahan belum tersimpan (tersimpan otomatis sebentar lagi)' : savedAt ? `Draf tersimpan pukul ${savedAt.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).replace(':', '.')} WIB` : 'Belum ada perubahan';
  const idx = CRITERIA.findIndex((c) => c.code === active);
  const cs = criterionSummary(scores, crit.code);

  return (
    <div>
      <PageHeader title={`Penilaian ${phase}`} crumbs={[{ label: 'Penugasan', to: ROLE_HOME.asesor }, { label: q.data.programName ?? `Pengajuan ${id.slice(0, 8)}`, to: `/pengajuan/${id}` }, { label: `Penilaian ${PHASE_LABEL[phase]}` }]}
        actions={<Link to={`/pengajuan/${id}`}><Button variant="secondary" icon={<ArrowLeft size={15} />}>Kembali ke Pengajuan</Button></Link>} />
      <div className="card sticky top-[68px] z-10 mb-4 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="font-medium">Penilaian {PHASE_LABEL[phase]} ({phase})</p>
            <p className="truncate text-sm text-muted">{q.data.programName}{q.data.programLevel ? ` (${q.data.programLevel})` : ''} · {q.data.institutionName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <div aria-live="polite"><div className="text-xs text-faint">Skor total (0 sampai {fmtNumber(MAX_TOTAL_SCORE)})</div><div className="text-2xl font-medium leading-none text-ink tabular-nums">{fmtNumber(total)}</div><div className="mt-1 text-xs text-muted" title={INST.rankNote}>Peringkat sementara: {rank ? rankLabel(rank) : 'belum ditetapkan pedoman'}</div></div>
            <div className="min-w-[10rem]"><div className="mb-1 text-sm text-muted">Terisi {filled} dari {count} butir</div><ProgressBar value={filled} max={count} label="Kelengkapan pengisian" /></div>
            {!locked && <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Save size={15} />} disabled={filled === 0} loading={saveDraft.isPending} onClick={() => saveDraft.mutate()}>Simpan Draf</Button>
              <Button disabled={!complete} onClick={() => setConfirm(true)}>Serahkan Hasil</Button>
            </div>}
            {locked && <Badge tone="success" icon={<Check size={12} />}>{ASSESS_STATUS_LABEL.submitted}</Badge>}
          </div>
        </div>
        {!locked && <p className="mt-2 text-sm text-muted">{status}. {!complete && 'Lengkapi seluruh butir untuk dapat menyerahkan hasil.'}</p>}
      </div>

      <StepIndicator className="mb-5" steps={[{ label: `Isi setiap butir (0 sampai ${MAX_ITEM})`, state: complete ? 'done' : 'current' }, { label: 'Periksa ringkasan skor', state: complete ? 'current' : 'todo' }, { label: 'Serahkan hasil', state: locked ? 'done' : 'todo' }]} />
      {locked && <div className="mb-5"><Notice tone="success" title="Penilaian telah diserahkan">Hasil tercatat permanen. Bila perlu memperbaiki, gunakan koreksi pada tab Catatan resmi di halaman pengajuan.</Notice></div>}
      {q.data.akStatus === 'consistency_returned' && phase === 'AK' && !locked && <div className="mb-5"><Notice tone="warn" title="Dikembalikan oleh KEA">Mohon periksa kembali nilai Bapak/Ibu sesuai catatan KEA.</Notice></div>}

      <div className="mb-6"><ScoringAiPanel submissionId={id} phase={phase} ai={ai} locked={locked} /></div>

      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <nav aria-label="Kriteria penilaian" className="card overflow-hidden">
          <p className="border-b border-line px-4 py-2.5 text-[15px] font-medium">Kriteria Penilaian</p>
          <ul className="divide-y divide-line">
            {CRITERIA.map((c) => {
              const sm = criterionSummary(scores, c.code); const f = sm.filled; const done = f === sm.count;
              return (
                <li key={c.code}>
                  <button type="button" onClick={() => setActive(c.code)} aria-current={c.code === active ? 'true' : undefined}
                    className={cx('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors', c.code === active ? 'bg-navy-50 shadow-[inset_3px_0_0_0_#1E4D8C]' : 'hover:bg-slate-50')}>
                    <span className={cx('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium', done ? 'bg-ok text-white' : f > 0 ? 'bg-navy-700 text-white' : 'bg-slate-200 text-muted')}>{done ? <Check size={14} aria-hidden /> : c.code.slice(1)}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">Kriteria {c.code.slice(1)}. {c.title}</span><span className="mt-1.5 block"><ProgressBar value={f} max={sm.count} label={`${c.code} terisi`} /></span><span className="mt-1 block text-xs text-muted">{f} dari {sm.count} butir · skor {fmtNumber(sm.subtotal)} dari {fmtNumber(sm.max)}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <Card title={`Kriteria ${crit.code.slice(1)}. ${crit.title}`} description={`Pilih tingkat skor 0 sampai ${MAX_ITEM} untuk setiap butir. Jumlah butir: ${cs.count}, skor kriteria ${fmtNumber(cs.subtotal)} dari ${fmtNumber(cs.max)}.`}
          actions={<Badge tone={cs.filled === cs.count ? 'success' : 'info'} icon={cs.filled === cs.count ? <Check size={13} /> : <CircleDot size={13} />}>{cs.filled} dari {cs.count} terisi</Badge>}>
          {!INST.scale.stated && <div className="mb-4"><Notice tone="info" title="Catatan skala penilaian">{INST.scale.note}</Notice></div>}
          <ul className="divide-y divide-line">
            {critItems.map((it) => {
              const v = scores[it.criterion]?.[it.id];
              const lbl = itemLabel(it);
              return (
                <li key={it.id} className="py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-ink">Butir {lbl}. {it.element}</p>
                    <span className="text-sm text-muted">Bobot {fmtNumber(it.weight)}{typeof v === 'number' ? ` · skor butir ${fmtNumber(v * it.weight)}` : ''}</span>
                  </div>
                  <p className="mt-1.5 leading-relaxed text-ink">{it.indicator}</p>
                  <p className="mt-1.5 text-sm text-muted">Dasar penilaian: {it.dataSource}.</p>
                  {it.quantitative && <p className="mt-1 text-sm text-muted">Butir kuantitatif: nilai acuan diambil dari LKPS. {it.formula ? `${it.formula}.` : 'Pedoman tidak mencantumkan rumus perhitungan.'}</p>}
                  <div role="radiogroup" aria-label={`Tingkat skor butir ${lbl}`} className={cx('mt-3', it.descriptors ? 'space-y-2' : 'flex flex-wrap gap-2')}>
                    {INST.scale.allowed.slice().reverse().map((n) => {
                      const d = it.descriptors?.find((x) => x.level === n);
                      const on = v === n;
                      return (
                        <button key={n} type="button" role="radio" aria-checked={on} disabled={locked} onClick={() => pick(it.criterion, it.id, n)}
                          className={cx('rounded-lg border text-left text-sm transition-colors disabled:opacity-60', it.descriptors ? 'flex w-full items-start gap-3 px-3 py-2.5' : 'grid h-9 min-w-[2.75rem] place-items-center px-3 font-medium', on ? 'border-navy-700 bg-navy-700 text-white' : 'border-slate-300 bg-white text-ink hover:border-navy-700 hover:bg-navy-50')}>
                          <span className="font-medium">{n}</span>{d && <span className="font-normal">{d.label}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {(() => { const sg = ai.suggestion(it.id); return sg ? <div className="mt-3"><SuggestionBlock item={sg} citations={ai.detail?.citations} compact action={sg.suggestedScore !== null && !locked ? <Button size="sm" variant="secondary" onClick={() => pick(it.criterion, it.id, sg.suggestedScore!)}>Pakai saran</Button> : undefined} /></div> : null; })()}
                  {!it.descriptors && <p className="mt-2 text-xs text-faint">Pedoman tidak memuat uraian per tingkat skor; Bapak/Ibu menilai berdasarkan uraian indikator dan data LED serta LKPS.</p>}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-between gap-2 border-t border-line pt-4">
            <Button variant="secondary" disabled={idx === 0} onClick={() => setActive(CRITERIA[idx - 1]!.code)}>Kriteria Sebelumnya</Button>
            <Button variant="secondary" disabled={idx === CRITERIA.length - 1} onClick={() => setActive(CRITERIA[idx + 1]!.code)}>Kriteria Berikutnya</Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog open={confirm} title={`Serahkan hasil ${PHASE_LABEL[phase]}?`} confirmLabel="Ya, serahkan hasil" pending={submit.isPending || saveDraft.isPending} onCancel={() => setConfirm(false)} onConfirm={() => void sendNow()}
        items={[['Program studi', q.data.programName], ['Jenis penilaian', `${PHASE_LABEL[phase]} (${phase})`], ['Skor total', `${fmtNumber(total)} dari ${fmtNumber(MAX_TOTAL_SCORE)}`], ['Peringkat sementara', rank ? rankLabel(rank) : 'belum ditetapkan pedoman'], ['Butir terisi', `${filled} dari ${count}`], ...CRITERIA.map((c) => { const sm = criterionSummary(scores, c.code); return [`Kriteria ${c.code.slice(1)}. ${c.title}`, `${fmtNumber(sm.subtotal)} dari ${fmtNumber(sm.max)}`] as [string, string]; })]} />
    </div>
  );
}
