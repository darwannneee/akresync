import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CircleDot, Save } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, ConfirmDialog, FormError, Input, Notice, PageSkeleton, ProgressBar, StepIndicator, cx } from '../../components/ui';
import { useSubmission } from '../common/queries';
import { useAction } from '../common/useAction';
import { ASSESS_STATUS_LABEL, PHASE_LABEL, fmtNumber } from '../../lib/labels';
import { CRITERIA, MAX_ITEM, MAX_TOTAL, computeTotal, emptyScores, type Scores } from './criteria';

const sub = (scores: Scores, code: string) => Object.values(scores[code] ?? {}).reduce<number>((a, v) => a + (typeof v === 'number' ? v : 0), 0);

export function ScoringPage() {
  const { id = '', phase: ph = 'AK' } = useParams();
  const phase = ph === 'AL' ? 'AL' : 'AK';
  const { user } = useAuth();
  const q = useSubmission(id);
  const qc = useQueryClient();
  const toast = useToast();
  const [scores, setScores] = useState<Scores>(emptyScores());
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState('C1');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [confirm, setConfirm] = useState(false);
  const latest = useRef(scores);
  latest.current = scores;
  const mine = q.data?.assessments?.find((a) => a.phase === phase && a.assessorId === user?.id);

  useEffect(() => {
    if (loaded || !q.data) return;
    const base = emptyScores();
    for (const [c, items] of Object.entries(mine?.scores ?? {})) for (const [k, v] of Object.entries(items)) if (base[c] && k in base[c]!) base[c]![k] = v;
    setScores(base); setLoaded(true);
    if (mine) setSavedAt(new Date());
  }, [q.data, mine, loaded]);

  const saveDraft = useMutation({
    // Server hanya menerima angka; butir yang masih kosong tidak dikirim.
    mutationFn: () => {
      const out: Record<string, Record<string, number>> = {};
      for (const [c, items] of Object.entries(latest.current)) { out[c] = {}; for (const [k, v] of Object.entries(items)) if (typeof v === 'number') out[c]![k] = v; }
      return api.put(`/submissions/${id}/assessments/${phase}/draft`, { scores: out });
    },
    onSuccess: () => { setDirty(false); setSavedAt(new Date()); void qc.invalidateQueries({ queryKey: ['submission', id] }); void qc.invalidateQueries({ queryKey: ['audit', id] }); },
    onError: (e) => toast.error(`Draf belum tersimpan. ${errorMessage(e)}`),
  });
  const submit = useAction(() => api.post(`/submissions/${id}/assessments/${phase}/submit`), { title: `Penilaian ${PHASE_LABEL[phase]} telah diserahkan`, submissionId: id });

  const locked = mine?.status === 'submitted';
  const { total, filled, count } = computeTotal(scores);
  const complete = filled === count;

  // Simpan draf otomatis 2,5 detik setelah perubahan terakhir.
  const mutate = saveDraft.mutate;
  useEffect(() => {
    if (!dirty || locked || !loaded || computeTotal(scores).filled === 0) return;
    const t = setTimeout(() => mutate(), 2500);
    return () => clearTimeout(t);
  }, [scores, dirty, locked, loaded, mutate]);

  const set = useCallback((c: string, k: string, raw: string) => {
    const n = raw === '' ? '' : Math.min(MAX_ITEM, Math.max(0, Number(raw)));
    setScores((s) => ({ ...s, [c]: { ...s[c], [k]: Number.isNaN(n) ? '' : n } })); setDirty(true);
  }, []);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <FormError message="Pengajuan tidak dapat dimuat. Muat ulang halaman atau kembali ke daftar." />;
  if (submit.isSuccess) return <Navigate to={`/pengajuan/${id}`} replace />;

  const crit = CRITERIA.find((c) => c.code === active) ?? CRITERIA[0]!;
  const critFilled = (code: string) => Object.values(scores[code] ?? {}).filter((v) => typeof v === 'number').length;
  const sendNow = async () => {
    try { if (dirty || !mine) await saveDraft.mutateAsync(); } catch { setConfirm(false); return; }
    submit.mutate(undefined);
  };
  const status = saveDraft.isPending ? 'Menyimpan draf…' : dirty ? 'Perubahan belum tersimpan (tersimpan otomatis sebentar lagi)' : savedAt ? `Draf tersimpan pukul ${savedAt.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).replace(':', '.')} WIB` : 'Belum ada perubahan';
  const idx = CRITERIA.findIndex((c) => c.code === active);

  return (
    <div>
      <Link to={`/pengajuan/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-navy-700 hover:underline"><ArrowLeft size={15} aria-hidden />Kembali ke pengajuan</Link>
      <div className="sticky top-16 z-10 -mx-4 mb-6 border-b border-line bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Penilaian {PHASE_LABEL[phase]} ({phase})</h1>
            <p className="truncate text-sm text-muted">{q.data.programName}{q.data.programLevel ? ` (${q.data.programLevel})` : ''} · {q.data.institutionName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <div aria-live="polite"><div className="text-xs font-semibold uppercase tracking-wide text-faint">Skor total (0 sampai {MAX_TOTAL})</div><div className="font-display text-3xl font-bold leading-none text-navy-900 tabular-nums">{fmtNumber(total)}</div></div>
            <div className="min-w-[10rem]"><div className="mb-1 text-sm text-muted">Terisi {filled} dari {count} butir</div><ProgressBar value={filled} max={count} label="Kelengkapan pengisian" /></div>
            {!locked && <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Save size={16} />} disabled={filled === 0} loading={saveDraft.isPending} onClick={() => saveDraft.mutate()}>Simpan draf</Button>
              <Button disabled={!complete} onClick={() => setConfirm(true)}>Serahkan hasil</Button>
            </div>}
            {locked && <Badge tone="success" icon={<Check size={13} />}>{ASSESS_STATUS_LABEL.submitted}</Badge>}
          </div>
        </div>
        {!locked && <p className="mt-2 text-sm text-muted">{status}. {!complete && 'Lengkapi seluruh butir untuk dapat menyerahkan hasil.'}</p>}
      </div>

      <StepIndicator className="mb-5" steps={[{ label: 'Isi setiap butir (0 sampai 4)', state: complete ? 'done' : 'current' }, { label: 'Periksa ringkasan skor', state: complete ? 'current' : 'todo' }, { label: 'Serahkan hasil', state: locked ? 'done' : 'todo' }]} />
      {locked && <div className="mb-5"><Notice tone="success" title="Penilaian telah diserahkan">Hasil tercatat permanen. Bila perlu memperbaiki, gunakan koreksi pada tab Catatan resmi di halaman pengajuan.</Notice></div>}
      {q.data.akStatus === 'consistency_returned' && phase === 'AK' && !locked && <div className="mb-5"><Notice tone="warn" title="Dikembalikan oleh KEA">Mohon periksa kembali nilai Bapak/Ibu sesuai catatan KEA.</Notice></div>}

      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <nav aria-label="Kriteria penilaian" className="card overflow-hidden lg:sticky lg:top-44">
          <p className="border-b border-line px-4 py-3 font-display font-semibold">Kriteria penilaian</p>
          <ul className="divide-y divide-line">
            {CRITERIA.map((c) => {
              const f = critFilled(c.code); const done = f === c.items;
              return (
                <li key={c.code}>
                  <button type="button" onClick={() => setActive(c.code)} aria-current={c.code === active ? 'true' : undefined}
                    className={cx('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors', c.code === active ? 'bg-navy-50 shadow-[inset_3px_0_0_0_#1E4D8C]' : 'hover:bg-slate-50')}>
                    <span className={cx('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', done ? 'bg-ok text-white' : f > 0 ? 'bg-navy-700 text-white' : 'bg-slate-200 text-muted')}>{done ? <Check size={14} aria-hidden /> : c.code.slice(1)}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{c.code}. {c.name}</span><span className="mt-1.5 block"><ProgressBar value={f} max={c.items} label={`${c.code} terisi`} /></span><span className="mt-1 block text-xs text-muted">{f} dari {c.items} butir · jumlah {fmtNumber(sub(scores, c.code))}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <Card title={`${crit.code}. ${crit.name}`} description={`Beri nilai 0 sampai ${MAX_ITEM} untuk setiap butir. Jumlah butir: ${crit.items}.`}
          actions={<Badge tone={critFilled(crit.code) === crit.items ? 'success' : 'info'} icon={critFilled(crit.code) === crit.items ? <Check size={13} /> : <CircleDot size={13} />}>{critFilled(crit.code)} dari {crit.items} terisi</Badge>}>
          <ul className="divide-y divide-line">
            {Array.from({ length: crit.items }, (_, i) => `b${i + 1}`).map((k, i) => {
              const v = scores[crit.code]?.[k] ?? '';
              const inputId = `score-${crit.code}-${k}`;
              return (
                <li key={k} className="flex flex-wrap items-center gap-4 py-4">
                  <label htmlFor={inputId} className="min-w-[10rem] flex-1"><span className="block text-base font-semibold text-ink">Butir {crit.code}.{i + 1}</span><span className="block text-sm text-muted">Nilai 0 sampai {MAX_ITEM}</span></label>
                  <div role="group" aria-label={`Pilihan cepat butir ${crit.code}.${i + 1}`} className="flex gap-1.5">
                    {[0, 1, 2, 3, 4].map((n) => (
                      <button key={n} type="button" disabled={locked} aria-pressed={v === n} onClick={() => set(crit.code, k, String(n))}
                        className={cx('grid h-10 w-10 place-items-center rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50', v === n ? 'border-navy-700 bg-navy-700 text-white' : 'border-slate-300 bg-white text-ink hover:border-navy-700 hover:bg-navy-50')}>{n}</button>
                    ))}
                  </div>
                  <Input id={inputId} type="number" inputMode="decimal" min={0} max={MAX_ITEM} step={0.5} disabled={locked} value={v} onChange={(e) => set(crit.code, k, e.target.value)} className="!w-24 text-center" aria-label={`Nilai butir ${crit.code}.${i + 1}, 0 sampai ${MAX_ITEM}`} />
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-between gap-2 border-t border-line pt-4">
            <Button variant="secondary" disabled={idx === 0} onClick={() => setActive(CRITERIA[idx - 1]!.code)}>Kriteria sebelumnya</Button>
            <Button variant="secondary" disabled={idx === CRITERIA.length - 1} onClick={() => setActive(CRITERIA[idx + 1]!.code)}>Kriteria berikutnya</Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog open={confirm} title={`Serahkan hasil ${PHASE_LABEL[phase]}?`} confirmLabel="Ya, serahkan hasil" pending={submit.isPending || saveDraft.isPending} onCancel={() => setConfirm(false)} onConfirm={() => void sendNow()}
        items={[['Program studi', q.data.programName], ['Jenis penilaian', `${PHASE_LABEL[phase]} (${phase})`], ['Skor total', `${fmtNumber(total)} dari ${MAX_TOTAL}`], ['Butir terisi', `${filled} dari ${count}`], ...CRITERIA.map((c) => [`${c.code}. ${c.name}`, `jumlah ${fmtNumber(sub(scores, c.code))} dari ${c.items * MAX_ITEM}`] as [string, string])]} />
    </div>
  );
}
