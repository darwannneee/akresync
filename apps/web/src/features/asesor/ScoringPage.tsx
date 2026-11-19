import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CloudCheck, CloudOff, Loader2 } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Button, ButtonLink, ConfirmDialog, FormError, Notice, PageSkeleton, ProgressBar, ScoreButtons, ScoreFigure, StatusDot, cx } from '../../components/ui';
import { useSubmission } from '../common/queries';
import { useAction, useDownload } from '../common/useAction';
import { PHASE_LABEL, fmtNumber, fmtScore, rankLabel } from '../../lib/labels';
import {
  INSTRUMENT_DOKTOR_2025 as INST, MAX_TOTAL_SCORE, computeTotal, criterionSummary, provisionalRank, weightedAverage,
  type AiCitation, type AiItemSuggestion, type CriterionCode, type InstrumentItem, type InstrumentScores,
} from '@akreditasi/shared';
import { needsRescore } from '../../lib/workflow';
import { CONFIDENCE_LABEL } from '../ai/parts';
import { ScoringAiPanel, useAiForScoring } from '../ai/ScoringAiPanel';

const CRITERIA = INST.criteria.filter((c) => c.scored);
const SCORED = INST.items.filter((i) => CRITERIA.some((c) => c.code === i.criterion));
const ITEM_COUNT = SCORED.length;
const MAX_ITEM = INST.scale.max;
const itemLabel = (i: InstrumentItem) => (i.sub ? `${i.no}.${i.sub}` : String(i.no));
const isSet = (s: InstrumentScores, i: InstrumentItem) => typeof s[i.criterion]?.[i.id] === 'number';
const countFilled = (s: InstrumentScores) => SCORED.filter((i) => isSet(s, i)).length;
const hhmm = (d: Date) => d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).replace(':', '.');

function ItemCard({ it, value, focus, locked, sg, citations, onPick }: {
  it: InstrumentItem; value: number | undefined; focus: boolean; locked: boolean; sg?: AiItemSuggestion; citations?: AiCitation[]; onPick: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const lbl = itemLabel(it);
  const show = !!sg && (focus || open);
  const sources = (sg?.citations ?? []).map((cid) => citations?.find((c) => c.chunkId === cid)).filter((c): c is AiCitation => !!c);
  return (
    <li id={`butir-${it.id}`} className={cx('card scroll-mt-28 p-[22px]', focus && !locked && 'ring-2 ring-navy-100')}>
      <div className="text-[13px] text-faint">Butir {lbl} · bobot {fmtNumber(it.weight)} · {it.element}</div>
      <p className="mt-1 text-[15.5px] font-medium leading-snug text-ink">{it.indicator}</p>
      {it.quantitative && <p className="mt-1.5 text-[13px] text-faint">Butir kuantitatif: nilai acuan diambil dari LKPS. {it.formula ? `${it.formula}.` : 'Pedoman tidak mencantumkan rumus perhitungan.'}</p>}
      {it.descriptors && <ul className="mt-2 space-y-0.5 text-[13.5px] text-muted">{it.descriptors.slice().sort((a, b) => b.level - a.level).map((d) => <li key={d.level}><b className="tabular-nums text-ink">{d.level}</b> {d.label}</li>)}</ul>}
      <div className="mt-4"><ScoreButtons value={value} onChange={onPick} allowed={INST.scale.allowed} suggested={sg?.suggestedScore} disabled={locked} label={`Tingkat skor butir ${lbl}`} /></div>
      {sg && !show && <button type="button" onClick={() => setOpen(true)} className="mt-4 text-[13.5px] font-semibold text-navy-700 hover:underline">Lihat saran AI</button>}
      {show && sg && (
        <div className="mt-5 rounded-xl bg-surface p-4 text-[14px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-ink">{sg.suggestedScore === null ? 'Saran AI: bukti tidak ditemukan' : `Saran AI: ${sg.suggestedScore}`}<span className="ml-2 font-normal text-faint">{CONFIDENCE_LABEL[sg.confidence]}</span></span>
            {sg.suggestedScore !== null && !locked && value !== sg.suggestedScore && <Button variant="ghost" size="sm" className="-mr-2" onClick={() => onPick(sg.suggestedScore!)}>Pakai saran</Button>}
          </div>
          {sg.justification && <p className="mt-1 leading-relaxed text-muted">{sg.justification}</p>}
          {sources.length > 0 && <p className="mt-2 text-[13px] text-faint">Sumber: {sources.map((c, i) => <span key={c.chunkId} title={c.excerpt}>{i > 0 && ' · '}{c.docType} {c.locator}</span>)}</p>}
        </div>
      )}
    </li>
  );
}

export function ScoringPage() {
  const { id = '', phase: ph = 'AK' } = useParams();
  const phase = ph === 'AL' ? 'AL' : 'AK';
  const { user } = useAuth();
  const q = useSubmission(id);
  const qc = useQueryClient();
  const toast = useToast();
  const download = useDownload();
  const [scores, setScores] = useState<InstrumentScores>({});
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState<CriterionCode>('K1');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [jump, setJump] = useState<{ id: string } | null>(null);
  const latest = useRef(scores);
  latest.current = scores;
  const ai = useAiForScoring(id);
  const mine = q.data?.assessments?.find((a) => a.phase === phase && a.assessorId === user?.id);

  useEffect(() => {
    if (loaded || !q.data) return;
    const base: InstrumentScores = {};
    const known = new Set(SCORED.map((i) => `${i.criterion}/${i.id}`));
    // Draf penilaian ulang (bila ada) dimuat lebih dulu; bila tidak, skor yang sudah diserahkan menjadi titik awal.
    for (const [c, items] of Object.entries(mine?.draftScores ?? mine?.scores ?? {})) for (const [k, v] of Object.entries(items)) if (known.has(`${c}/${k}`) && typeof v === 'number') (base[c] ??= {})[k] = v;
    setScores(base); setLoaded(true);
    if (mine) setSavedAt(new Date());
  }, [q.data, mine, loaded]);

  const saveDraft = useMutation({
    mutationFn: () => api.put(`/submissions/${id}/assessments/${phase}/draft`, { scores: latest.current }),
    onSuccess: () => { setDirty(false); setSavedAt(new Date()); void qc.invalidateQueries({ queryKey: ['submission', id] }); void qc.invalidateQueries({ queryKey: ['audit', id] }); },
    onError: (e) => toast.error(`Draf belum tersimpan. ${errorMessage(e)}`),
  });
  const submit = useAction(() => api.post(`/submissions/${id}/assessments/${phase}/submit`), { title: `Penilaian ${PHASE_LABEL[phase]} telah diserahkan`, submissionId: id });
  const minutes = useAction((file: File) => { const f = new FormData(); f.append('file', file); return api.upload(`/submissions/${id}/al-minutes`, f); }, { title: 'Berita Acara telah diunggah', submissionId: id });

  // Setelah KEA mengembalikan AK, halaman penilaian dibuka kembali sampai penilaian diserahkan ulang.
  const returnedByKea = phase === 'AK' && q.data?.akStatus === 'consistency_returned';
  const rescoreOpen = !!q.data && !!mine && needsRescore(q.data, mine);
  const keaNotes = [...(q.data?.offers ?? [])].reverse().find((o) => o.consistencyNotes)?.consistencyNotes;
  const minutesDocs = (q.data?.documents ?? []).filter((d) => d.docType === 'AL_MINUTES');
  const minutesDoc = minutesDocs.find((d) => d.id === mine?.minutesDocumentId) ?? minutesDocs[minutesDocs.length - 1];
  const hasMinutes = phase === 'AL' && (!!mine?.minutesDocumentId || minutesDocs.length > 0);
  const locked = mine?.status === 'submitted' && !rescoreOpen;
  const total = computeTotal(scores);
  const avg = weightedAverage(scores);
  const filled = countFilled(scores);
  const count = ITEM_COUNT;
  const complete = filled === count;
  const canSubmit = complete && (phase === 'AK' || hasMinutes);
  const rank = provisionalRank(total);
  const lastOffer = (q.data?.offers ?? []).slice(-1)[0];
  const notLead = phase === 'AL' && !mine && !!lastOffer && lastOffer.leadAssessorId !== user?.id;

  // Simpan draf otomatis 2,5 detik setelah perubahan terakhir.
  const mutate = saveDraft.mutate;
  useEffect(() => {
    if (!dirty || locked || !loaded || countFilled(scores) === 0) return;
    const t = setTimeout(() => mutate(), 2500);
    return () => clearTimeout(t);
  }, [scores, dirty, locked, loaded, mutate]);

  useEffect(() => {
    if (!jump) return;
    const el = document.getElementById(`butir-${jump.id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector<HTMLButtonElement>('[role=radio]')?.focus({ preventScroll: true });
  }, [jump]);

  const pick = useCallback((c: string, k: string, n: number) => {
    setScores((s) => ({ ...s, [c]: { ...s[c], [k]: n } })); setDirty(true);
  }, []);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <FormError message="Pengajuan tidak dapat dimuat. Muat ulang halaman atau kembali ke daftar." />;
  if (submit.isSuccess) return <Navigate to={`/pengajuan/${id}`} replace />;
  const s = q.data;
  if (notLead) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Notice tone="info" title="Penilaian Asesmen Lapangan diisi oleh ketua asesor">Bapak/Ibu dapat mengikuti perkembangannya pada halaman pengajuan.</Notice>
        <ButtonLink to={`/pengajuan/${id}`} variant="secondary" icon={<ChevronLeft size={16} />}>Kembali ke pengajuan</ButtonLink>
      </div>
    );
  }

  const idx = CRITERIA.findIndex((c) => c.code === active);
  const crit = CRITERIA[idx] ?? CRITERIA[0]!;
  const critItems = SCORED.filter((i) => i.criterion === crit.code);
  const cs = criterionSummary(scores, crit.code);
  const focusId = critItems.find((i) => !isSet(scores, i))?.id;
  const goCrit = (code: CriterionCode) => { setActive(code); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const nextEmpty = () => {
    const order = [...CRITERIA.slice(idx), ...CRITERIA.slice(0, idx)];
    for (const c of order) {
      const it = SCORED.find((i) => i.criterion === c.code && !isSet(scores, i));
      if (it) { setActive(c.code); setJump({ id: it.id }); return; }
    }
  };
  const sendNow = async () => {
    try { if (dirty || !mine || (rescoreOpen && !mine.draftScores)) await saveDraft.mutateAsync(); } catch { setConfirm(false); return; }
    submit.mutate(undefined);
  };
  const docs = (['LED', 'LKPS'] as const).map((t) => {
    const all = (s.documents ?? []).filter((d) => d.docType === t);
    return all.find((d) => d.setVersion === s.documentSetVersion) ?? all.sort((a, b) => b.setVersion - a.setVersion)[0];
  }).filter((d): d is NonNullable<typeof d> => !!d);
  const save = saveDraft.isPending
    ? <><Loader2 size={16} className="animate-spin" aria-hidden />Menyimpan…</>
    : saveDraft.isError && dirty
      ? <><CloudOff size={16} className="text-bad" aria-hidden />Belum tersimpan<button type="button" onClick={() => saveDraft.mutate()} className="font-semibold text-navy-700 hover:underline">Coba lagi</button></>
      : dirty ? <><span aria-hidden className="h-2 w-2 rounded-full bg-slate-300" />Perubahan belum tersimpan</>
      : savedAt ? <><CloudCheck size={16} className="text-ok" aria-hidden />Tersimpan {hhmm(savedAt)}</>
      : <>Belum ada perubahan</>;

  return (
    <div className={phase === 'AL' ? 'pb-36 sm:pb-20' : 'pb-16'}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link to={`/pengajuan/${id}`} className="text-[14px] text-faint hover:text-navy-700">{s.programName ?? `Pengajuan ${id.slice(0, 8)}`}{s.institutionName ? ` · ${s.institutionName}` : ''}</Link>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Penilaian {PHASE_LABEL[phase]}</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right" aria-live="polite"><div className="text-[13px] text-faint">Skor sementara</div><ScoreFigure value={avg} max={MAX_ITEM} /></div>
          {!locked && <div className="flex items-center gap-2 text-[13.5px] text-faint" aria-live="polite">{save}</div>}
          {locked && <StatusDot tone="ok">Telah diserahkan</StatusDot>}
        </div>
      </div>

      <div className="mt-6 space-y-3 empty:hidden">
        {locked && !returnedByKea && <Notice tone="success" title="Penilaian telah diserahkan">Hasil tercatat permanen. Penilaian hanya dapat diubah lagi bila KEA mengembalikannya untuk dinilai ulang.</Notice>}
        {locked && returnedByKea && <Notice tone="success" title="Penilaian ulang telah diserahkan">Hasil perbaikan Bapak/Ibu sudah tercatat. Menunggu asesor lain dan pemeriksaan ulang KEA.</Notice>}
        {returnedByKea && !locked && <Notice tone="warn" title="Dikembalikan oleh KEA untuk dinilai ulang">{keaNotes ? <span className="whitespace-pre-wrap">Catatan KEA: {keaNotes}</span> : 'Mohon periksa kembali nilai Bapak/Ibu.'} Perbaiki skor yang perlu, lalu serahkan ulang hasil.</Notice>}
        {!INST.scale.stated && <Notice tone="info" title="Catatan skala penilaian">{INST.scale.note}</Notice>}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-12">
        <nav aria-label="Kriteria penilaian" className="lg:sticky lg:top-24 lg:col-span-3">
          <ul className="card space-y-0.5 p-2 text-[14px]">
            {CRITERIA.map((c) => {
              const sm = criterionSummary(scores, c.code); const on = c.code === active; const done = sm.filled === sm.count;
              return (
                <li key={c.code}>
                  <button type="button" onClick={() => goCrit(c.code)} aria-current={on ? 'true' : undefined}
                    className={cx('flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left', on ? 'bg-navy-50 font-semibold text-navy-700' : 'text-muted hover:bg-slate-50')}>
                    <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-full', done ? 'bg-ok' : on ? 'bg-navy-700' : 'bg-slate-300')} />
                    <span className="min-w-0 flex-1 leading-snug">{c.code.slice(1)}. {c.title}</span>
                    <span className={cx('text-[13px] tabular-nums', !on && 'text-faint')}>{sm.filled}/{sm.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4 lg:col-span-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-semibold">Kriteria {crit.code.slice(1)} · {crit.title}</h2>
            <span className="text-[13.5px] text-faint">{cs.filled} dari {cs.count} terisi</span>
          </div>
          <ul className="space-y-4">
            {critItems.map((it) => (
              <ItemCard key={it.id} it={it} value={scores[it.criterion]?.[it.id]} focus={it.id === focusId} locked={locked} sg={ai.suggestion(it.id)} citations={ai.detail?.citations}
                onPick={(n) => pick(it.criterion, it.id, n)} />
            ))}
          </ul>
          <p className="flex items-center gap-2 text-[13px] text-faint"><span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />Titik emas = saran AI. Skor resmi tetap ditentukan asesor.</p>
          {critItems.some((i) => !i.descriptors) && <p className="text-[13px] text-faint">Pedoman tidak memuat uraian per tingkat skor (0 sampai {MAX_ITEM}); Bapak/Ibu menilai berdasarkan uraian indikator dan data LED serta LKPS.</p>}
          <div className="flex justify-between gap-2 pt-2">
            <Button variant="secondary" icon={<ChevronLeft size={16} />} disabled={idx <= 0} onClick={() => goCrit(CRITERIA[idx - 1]!.code)}>Kriteria sebelumnya</Button>
            <Button variant="secondary" disabled={idx >= CRITERIA.length - 1} onClick={() => goCrit(CRITERIA[idx + 1]!.code)}>Kriteria berikutnya<ChevronRight size={16} aria-hidden /></Button>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:col-span-3">
          <ScoringAiPanel submissionId={id} phase={phase} ai={ai} locked={locked} />
          <section className="card p-[22px]" aria-label="Dokumen">
            <div className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-faint">Dokumen</div>
            {docs.length ? docs.map((d) => (
              <button key={d.id} type="button" onClick={() => download(`/documents/${d.id}/download`, d.fileName)} className="mt-3 flex w-full items-center justify-between gap-3 text-left text-[14px]">
                <span className="min-w-0 truncate" title={d.fileName}>{d.fileName}</span><span className="shrink-0 font-semibold text-navy-700">Buka</span>
              </button>
            )) : <p className="mt-3 text-[14px] text-faint">LED dan LKPS belum tersedia.</p>}
          </section>
        </aside>
      </div>

      <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white lg:left-[248px]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5 sm:px-8">
          <div className="w-full sm:w-56">
            <div className="flex justify-between text-[13px] text-faint"><span>Terisi</span><span className="tabular-nums">{filled} / {count} butir</span></div>
            <div className="mt-1.5"><ProgressBar value={filled} max={count} label="Kelengkapan pengisian" /></div>
          </div>
          {phase === 'AL' && (
            <div className="flex min-w-0 items-center gap-3 text-[13.5px]">
              <div className="min-w-0">
                <div className="font-semibold text-ink">Berita Acara</div>
                <div className="truncate text-faint" title={minutesDoc?.fileName}>{hasMinutes ? minutesDoc?.fileName ?? 'Sudah diunggah' : 'Belum diunggah · wajib sebelum menyerahkan'}</div>
              </div>
              {!locked && (
                <label className={cx('inline-flex min-h-[36px] shrink-0 cursor-pointer items-center gap-2 rounded-[10px] border border-[#D5D9E0] bg-white px-3.5 text-sm font-semibold text-ink hover:bg-slate-50 focus-within:ring-[3px] focus-within:ring-navy-100', minutes.isPending && 'pointer-events-none opacity-70')}>
                  {minutes.isPending && <Loader2 size={15} className="animate-spin" aria-hidden />}{hasMinutes ? 'Ganti' : 'Pilih berkas'}
                  <input type="file" className="sr-only" disabled={minutes.isPending} accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.png,.jpg,.jpeg" aria-label="Unggah Berita Acara Asesmen Lapangan"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) minutes.mutate(f); }} />
                </label>
              )}
            </div>
          )}
          {!locked && (
            <div className="ml-auto flex flex-wrap gap-2">
              {!complete && <Button variant="secondary" onClick={nextEmpty}>Ke butir kosong berikutnya</Button>}
              <Button disabled={!canSubmit} title={!complete ? 'Lengkapi seluruh butir terlebih dahulu' : !canSubmit ? 'Unggah Berita Acara terlebih dahulu' : undefined} onClick={() => setConfirm(true)}>{rescoreOpen ? 'Serahkan ulang penilaian' : 'Serahkan penilaian'}</Button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog size="lg" open={confirm} title={`${rescoreOpen ? 'Serahkan ulang' : 'Serahkan'} hasil ${PHASE_LABEL[phase]}?`} confirmLabel={rescoreOpen ? 'Ya, serahkan ulang' : 'Ya, serahkan hasil'} pending={submit.isPending || saveDraft.isPending} onCancel={() => setConfirm(false)} onConfirm={() => void sendNow()}
        items={[['Program studi', s.programName], ['Jenis penilaian', `${PHASE_LABEL[phase]} (${phase})`], ['Skor rata-rata berbobot', `${fmtScore(avg)} dari ${fmtScore(MAX_ITEM)}`], ['Skor total', `${fmtNumber(total)} dari ${fmtNumber(MAX_TOTAL_SCORE)}`], ['Peringkat sementara', rank ? rankLabel(rank) : 'belum tersedia (ditetapkan Majelis)'], ['Butir terisi', `${filled} dari ${count}`], ...CRITERIA.map((c) => { const sm = criterionSummary(scores, c.code); return [`Kriteria ${c.code.slice(1)}. ${c.title}`, `${fmtNumber(sm.subtotal)} dari ${fmtNumber(sm.max)}`] as [string, string]; })]} />
    </div>
  );
}
