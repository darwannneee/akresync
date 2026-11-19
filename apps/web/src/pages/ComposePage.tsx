import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Circle, CloudCheck, File as FileIcon, FileText, Loader2, MinusCircle, Paperclip, RotateCcw, Sheet, TriangleAlert, Upload } from 'lucide-react';
import { INSTRUMENT_DOKTOR_2025 } from '@akreditasi/shared';
import { api, errorMessage } from '../api/client';
import type { DocumentView, SubmissionDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, ButtonLink, Card, EmptyState, Notice, PageHeader, PageSkeleton, ScoreFigure, StatusDot, cx } from '../components/ui';
import { useAiDetail, useAiList, useRerunAi } from '../features/ai/hooks';
import { useConfirmed } from '../features/common/forms';
import { fetchSubmission } from '../features/common/queries';
import { useAction } from '../features/common/useAction';
import { fmtBytes, fmtRelative, fmtScore } from '../lib/labels';

type AiState = 'empty' | 'run' | 'done' | 'failed' | 'off';
type MainType = 'LED' | 'LKPS';

const MAIN: Record<MainType, { label: string; kind: string; accept: string; ext: RegExp; Icon: typeof FileText }> = {
  LED: { label: 'Laporan Evaluasi Diri', kind: 'PDF', accept: '.pdf,application/pdf', ext: /\.pdf$/i, Icon: FileText },
  LKPS: { label: 'Laporan Kinerja Program Studi', kind: 'Excel (.xlsx)', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: /\.xlsx$/i, Icon: Sheet },
};
const MAX_BYTES = 25 * 1024 * 1024;
/** Pemeriksaan format di peramban sebelum unggah (isi diperiksa server dengan aturan, tanpa AI). */
const precheck = (type: MainType, f: File): string | null =>
  !MAIN[type].ext.test(f.name) ? `${type} harus berupa berkas ${MAIN[type].kind}. Berkas "${f.name}" tidak sesuai.`
    : f.size > MAX_BYTES ? 'Ukuran berkas melebihi 25 MB.'
      : f.size === 0 ? 'Berkas kosong.' : null;
const CRITERIA = INSTRUMENT_DOKTOR_2025.criteria;
const ITEMS = new Map(INSTRUMENT_DOKTOR_2025.items.map((i) => [i.id, i]));
const ACTIVE = ['queued', 'running'];

const currentDocs = (s?: SubmissionDetail) => (s?.documents ?? []).filter((d) => d.setVersion === s?.documentSetVersion);
const currentScore = (s?: SubmissionDetail) => (s?.aiScore && s.aiScore.setVersion === s.documentSetVersion ? s.aiScore : null);
function aiStateOf(s?: SubmissionDetail): AiState {
  const p = s?.aiProgress;
  const docs = currentDocs(s);
  if (!p?.enabled) return 'off';
  if (!docs.some((d) => d.docType === 'LED') || !docs.some((d) => d.docType === 'LKPS')) return 'empty';
  if (currentScore(s)) return 'done';
  return p.phase === 'failed' || (!p.analysis && p.documents.some((d) => d.indexStatus === 'failed')) ? 'failed' : 'run';
}

function useUpload(id: string, docType: string) {
  return useAction((file: File) => {
    const f = new FormData(); f.append('file', file); f.append('docType', docType);
    return api.upload(`/submissions/${id}/documents`, f);
  }, { title: 'Dokumen berhasil diunggah', submissionId: id });
}

function useElapsed(since: string | null | undefined, on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  if (!since) return null;
  const sec = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

function FileTile({ id, type, doc, check, aiBusy, locked }: { id: string; type: MainType; doc?: DocumentView; check?: { status: string; reason: string | null } | null; aiBusy: boolean; locked: boolean }) {
  const m = useUpload(id, type);
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const { label, kind, accept, Icon } = MAIN[type];
  const [localErr, setLocalErr] = useState<string | null>(null);
  const pick = (f?: File | null) => {
    if (!f || m.isPending) return;
    const err = precheck(type, f);
    setLocalErr(err);
    if (!err) m.mutate(f);
  };
  const picker = <input ref={input} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />;
  const errText = localErr ?? (m.error ? errorMessage(m.error) : null);
  const error = errText ? <p role="alert" className="mt-2 text-[13.5px] text-bad">{errText}</p> : null;
  const dnd = {
    onDragOver: (e: DragEvent) => { e.preventDefault(); setDrag(true); },
    onDragLeave: () => setDrag(false),
    onDrop: (e: DragEvent) => { e.preventDefault(); setDrag(false); if (!locked) pick(e.dataTransfer.files?.[0]); },
  };
  if (!doc) {
    return (
      <div {...dnd}>
        <button type="button" disabled={m.isPending} onClick={() => input.current?.click()}
          className={cx('flex min-h-[132px] w-full flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed px-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-navy-100',
            drag ? 'border-navy-700 bg-navy-50' : m.error ? 'border-bad' : 'border-gray-300 hover:border-navy-700 hover:bg-navy-50', m.isPending && 'cursor-wait')}>
          {m.isPending
            ? <><Loader2 size={20} className="animate-spin text-navy-700" aria-hidden /><div className="mt-2 font-semibold">Mengunggah…</div><div className="text-[13.5px] text-faint">Jenis berkas diperiksa otomatis, mohon tunggu sebentar.</div></>
            : <><Upload size={20} className="text-navy-700" aria-hidden /><div className="mt-2 font-semibold">{type} · {label}</div><div className="text-[13.5px] text-faint">Pilih atau seret berkas {kind}</div></>}
        </button>
        {picker}{error}
      </div>
    );
  }
  const status: ReactNode = m.isPending ? <span className="flex items-center gap-1.5 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden />Mengunggah…</span>
    : check?.status === 'mismatch' ? <span className="flex items-center gap-1.5 text-wait"><TriangleAlert size={16} aria-hidden />Jenis dokumen perlu diperiksa</span>
      : aiBusy ? <span className="flex items-center gap-1.5 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden />Sedang dibaca AI</span>
        : <span className="flex items-center gap-1.5 text-ok"><CheckCircle2 size={16} aria-hidden />{check?.status === 'verified' ? 'Terunggah dan sesuai' : 'Terunggah'}</span>;
  return (
    <div {...dnd} className={cx('flex min-h-[132px] flex-col rounded-xl border p-4 transition-colors', drag && !locked ? 'border-navy-700 bg-navy-50' : 'border-line')}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-muted" aria-hidden><Icon size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-faint">{type} · {label}</div>
          <div className="truncate font-semibold" title={doc.fileName}>{doc.fileName}</div>
          <div className="text-[13px] text-faint">{fmtBytes(doc.sizeBytes)}{doc.createdAt ? ` · diunggah ${fmtRelative(doc.createdAt)}` : ''}</div>
        </div>
      </div>
      {check?.status === 'mismatch' && check.reason && <p className="mt-2 text-[13px] text-muted">{check.reason}</p>}
      {error}
      <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-[13.5px]">
        {status}
        <button type="button" disabled={locked || m.isPending} onClick={() => input.current?.click()} title={locked ? 'Tunggu pemeriksaan AI selesai' : undefined}
          className="rounded font-semibold text-navy-700 hover:underline disabled:cursor-not-allowed disabled:text-faint disabled:no-underline">Ganti</button>
      </div>
      {picker}
    </div>
  );
}

function AiCard({ s, state }: { s: SubmissionDetail; state: AiState }) {
  const list = useAiList(s.id, !!s.aiProgress?.enabled);
  const score = state === 'done' ? s.aiScore ?? null : null;
  const detail = useAiDetail(score?.analysisId);
  const rerun = useRerunAi(s.id);
  const phase = s.aiProgress?.phase;
  const { refetch } = list;
  useEffect(() => { void refetch(); }, [phase, s.documentSetVersion, refetch]);
  const latest = list.data?.latest?.setVersion === s.documentSetVersion ? list.data.latest : null;
  const docTimes = (s.documents ?? []).filter((d) => d.setVersion === s.documentSetVersion && d.docType !== 'SUPPORT' && d.createdAt).map((d) => d.createdAt!).sort();
  const elapsed = useElapsed(latest && ACTIVE.includes(latest.status) ? latest.createdAt : docTimes[docTimes.length - 1], state === 'run');
  const lacking = useMemo(() => {
    const seen = new Set<string>();
    return (detail.data?.result?.items ?? [])
      .filter((i) => i.suggestedScore === null || i.suggestedScore <= 1)
      .sort((a, b) => (a.suggestedScore ?? -1) - (b.suggestedScore ?? -1) || (ITEMS.get(b.butirId)?.weight ?? 0) - (ITEMS.get(a.butirId)?.weight ?? 0))
      .map((i) => ITEMS.get(i.butirId)?.element)
      .filter((e): e is string => !!e && !seen.has(e) && !!seen.add(e))
      .slice(0, 4);
  }, [detail.data]);

  if (state === 'off') return <Card title={<span className="text-faint">Pemeriksaan AI</span>}><p className="text-[14.5px] text-faint">Pemeriksaan AI tidak tersedia saat ini. Pengajuan tetap dapat dikirim tanpa skor AI.</p></Card>;
  if (state === 'empty') return <Card title={<span className="text-faint">Pemeriksaan AI</span>}><p className="text-[14.5px] text-faint">Pemeriksaan AI dimulai otomatis setelah LED dan LKPS terunggah.</p></Card>;
  if (state === 'run') {
    return (
      <Card title="Pemeriksaan AI" actions={elapsed && <span className="tabular-nums" aria-label={`Berjalan ${elapsed}`}>{elapsed}</span>}>
        <div role="status" className="font-medium">AI sedang membaca dan menilai dokumen…</div>
        <div className="indet mt-4 h-1.5 rounded-full bg-navy-100" aria-hidden />
        <p className="mt-4 text-[14px] text-faint">Halaman ini boleh ditutup. Hasilnya akan tersedia di sini dan di Beranda.</p>
      </Card>
    );
  }
  if (state === 'failed') {
    const indexFailed = !latest && s.aiProgress?.documents.some((d) => d.indexStatus === 'failed');
    return (
      <Card title="Pemeriksaan AI" actions={<StatusDot tone="bad">Belum berhasil</StatusDot>}>
        {(latest?.error || indexFailed) && <p className="text-[14.5px] text-ink">{latest?.error ?? 'Dokumen belum berhasil dibaca oleh AI.'}</p>}
        <p className="text-[14.5px] text-muted">Coba lagi, atau kirim pengajuan tanpa skor AI.</p>
        <Button variant="secondary" className="mt-4" icon={<RotateCcw size={16} aria-hidden />} loading={rerun.isPending} onClick={() => rerun.mutate()}>Coba lagi</Button>
      </Card>
    );
  }
  const t = score!.totals;
  return (
    <Card flush title="Hasil pemeriksaan AI" actions="Bukan nilai resmi">
      <div className="grid gap-6 p-[22px] md:grid-cols-12">
        <div className="md:col-span-4">
          <div className="text-[13px] text-faint">Skor sementara</div>
          <ScoreFigure className="mt-1" size="lg" value={t.weighted} max={t.scaleMax} />
          <div className="mt-2 text-[13px] text-faint">{t.answered} dari {t.itemCount} butir buktinya ditemukan</div>
          {lacking.length > 0 && (
            <div className="mt-5 rounded-xl bg-wait-bg p-4 text-[14px]">
              <div className="font-semibold text-wait">Sebaiknya dilengkapi</div>
              <ul className="mt-1.5 space-y-1 text-muted">{lacking.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
        </div>
        <ul className="space-y-3 md:col-span-8">
          {CRITERIA.map((c, i) => {
            const v = t.perCriterion.find((x) => x.code === c.code)?.average ?? null;
            return (
              <li key={c.code} className="grid grid-cols-[minmax(0,1fr)_120px_40px] items-center gap-3 text-[14px]">
                <span className="truncate text-muted" title={c.title}>{i + 1}. {c.title}</span>
                <span className="h-1.5 rounded-full bg-gray-100" aria-hidden><span className={cx('block h-1.5 rounded-full', v !== null && v < 2.75 ? 'bg-wait' : 'bg-navy-700')} style={{ width: `${v === null ? 0 : Math.min(100, (v / t.scaleMax) * 100)}%` }} /></span>
                <b className="text-right tabular-nums">{fmtScore(v)}</b>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-line px-[22px] py-4 text-[14px] text-muted">Belum puas? Klik <b>Ganti</b> pada LED atau LKPS, AI akan memeriksa ulang otomatis.</div>
    </Card>
  );
}

function SupportCard({ id, docs }: { id: string; docs: DocumentView[] }) {
  const m = useUpload(id, 'SUPPORT');
  const input = useRef<HTMLInputElement>(null);
  return (
    <Card flush title={<>Dokumen pendukung <span className="font-normal text-faint">(opsional)</span></>}
      actions={<Button variant="secondary" size="sm" icon={<Paperclip size={16} aria-hidden />} loading={m.isPending} onClick={() => input.current?.click()}>Tambah berkas</Button>}>
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) m.mutate(f); e.target.value = ''; }} />
      {docs.length === 0 && <p className="px-[22px] py-4 text-[14.5px] text-faint">Belum ada berkas pendukung, misalnya surat tugas tim akreditasi atau bukti kerja sama.</p>}
      <ul className="divide-y divide-line">
        {docs.map((d) => <li key={d.id} className="flex items-center gap-3 px-[22px] py-4 text-[14.5px]"><FileIcon size={18} className="shrink-0 text-faint" aria-hidden /><span className="min-w-0 flex-1 truncate">{d.fileName} <span className="text-faint">· {fmtBytes(d.sizeBytes)}</span></span></li>)}
      </ul>
      {m.error && <p role="alert" className="border-t border-line px-[22px] py-3 text-[13.5px] text-bad">{errorMessage(m.error)}</p>}
    </Card>
  );
}

const CHECK_ICON = {
  ok: <CheckCircle2 size={18} className="shrink-0 text-ok" aria-hidden />,
  todo: <Circle size={18} className="shrink-0 text-faint" aria-hidden />,
  run: <Loader2 size={18} className="shrink-0 animate-spin text-navy-700" aria-hidden />,
  fail: <AlertCircle size={18} className="shrink-0 text-bad" aria-hidden />,
  opt: <MinusCircle size={18} className="shrink-0 text-faint" aria-hidden />,
};

/** Halaman kerja UPPS: susun pengajuan. Berkas terunggah langsung, AI memeriksa otomatis, lalu kirim. */
export function ComposePage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['submission', id], queryFn: () => fetchSubmission(id), refetchInterval: (x) => (aiStateOf(x.state.data) === 'run' ? 3000 : false) });
  const s = q.data;
  const rev = s?.stage === 'admin_revision';
  const submit = useAction(() => api.post(`/submissions/${id}/submit`), { title: rev ? 'Perbaikan dokumen telah dikirim' : 'Pengajuan resmi telah dikirim', submissionId: id, onDone: () => nav(`/pengajuan/${id}`) });
  const docs = currentDocs(s);
  const doc = (t: string) => docs.filter((d) => d.docType === t).slice(-1)[0];
  const support = docs.filter((d) => d.docType === 'SUPPORT');
  const p = s?.aiProgress;
  const score = currentScore(s);
  const hasMain = !!doc('LED') && !!doc('LKPS');
  const ai = aiStateOf(s);
  const recordedAt = s?.adminVerification?.recordedAt;
  const needsNewSet = rev && !!recordedAt && !docs.some((d) => d.createdAt && new Date(d.createdAt) > new Date(recordedAt));
  const confirm = useConfirmed<null>({
    run: () => submit.mutate(undefined), pending: submit.isPending, title: rev ? 'Kirim perbaikan dokumen?' : 'Kirim pengajuan resmi?', confirmLabel: rev ? 'Ya, kirim perbaikan' : 'Ya, kirim pengajuan',
    summary: () => [
      ['Program studi', s?.programName ? `${s.programName}${s.programLevel ? ` (${s.programLevel})` : ''}` : '—'],
      ['Institusi', s?.institutionName],
      ['Dokumen utama', `LED: ${doc('LED')?.fileName ?? '—'}; LKPS: ${doc('LKPS')?.fileName ?? '—'}`],
      ['Skor AI', score ? `${fmtScore(score.totals.weighted)} / ${fmtScore(score.totals.scaleMax)} (bukan nilai resmi)` : 'Tanpa skor AI'],
      ['Dokumen pendukung', `${support.length} berkas`],
    ],
  });

  if (q.isLoading) return <PageSkeleton />;
  if (!s || user?.role !== 'upps') {
    return <EmptyState title="Pengajuan tidak dapat dibuka" action={<ButtonLink to="/upps" variant="secondary">Kembali ke Beranda</ButtonLink>}>{q.error ? errorMessage(q.error) : 'Halaman ini hanya untuk UPPS pemilik pengajuan.'}</EmptyState>;
  }
  if (s.stage !== 'draft' && !rev) {
    return (
      <EmptyState title="Pengajuan ini sudah tidak dalam tahap penyusunan" action={<ButtonLink to={`/pengajuan/${id}`}>Buka rincian pengajuan</ButtonLink>}>
        Dokumen telah dikirim. Perkembangan proses dapat Bapak/Ibu pantau pada halaman rincian pengajuan.
      </EmptyState>
    );
  }

  const analysisActive = ACTIVE.includes(p?.analysis?.status ?? '');
  const ready = hasMain && !needsNewSet;
  const fallback = ai === 'failed' || ai === 'off';
  const checks: [string, keyof typeof CHECK_ICON][] = [
    ['LED terunggah', doc('LED') ? 'ok' : 'todo'],
    ['LKPS terunggah', doc('LKPS') ? 'ok' : 'todo'],
    [ai === 'off' ? 'Pemeriksaan AI (tidak tersedia)' : 'Pemeriksaan AI', ai === 'done' ? 'ok' : ai === 'run' ? 'run' : ai === 'failed' ? 'fail' : ai === 'off' ? 'opt' : 'todo'],
    ['Dokumen pendukung (opsional)', support.length ? 'ok' : 'opt'],
  ];
  const missing = [!doc('LED') && 'LED', !doc('LKPS') && 'LKPS'].filter(Boolean).join(' dan ');
  const note = missing ? `Unggah ${missing} untuk melanjutkan.`
    : needsNewSet ? 'Unggah dokumen yang telah diperbaiki untuk melanjutkan.'
      : ai === 'run' ? 'Tombol aktif setelah pemeriksaan AI selesai.'
        : fallback ? 'Asesor tetap dapat meminta analisis AI nanti.'
          : `${rev ? 'Perbaikan' : 'Pengajuan'} tersimpan permanen dan diteruskan ke Sekretariat Administrasi.`;

  return (
    <div>
      <PageHeader title={rev ? 'Perbaiki dokumen pengajuan' : 'Susun pengajuan akreditasi'}
        crumbs={[{ label: s.programName ?? 'Pengajuan', to: `/pengajuan/${id}` }, { label: 'Susun' }]}
        actions={<span className="flex items-center gap-2 text-[13.5px] text-faint"><CloudCheck size={16} className="text-ok" aria-hidden />Tersimpan otomatis</span>} />
      {rev && (
        <Notice tone="warn" title="Sekretariat meminta perbaikan" className="mb-6">
          {s.adminVerification?.notes && <span className="block whitespace-pre-wrap">Catatan Sekretariat Administrasi: {s.adminVerification.notes}</span>}
          <span className="mt-1 block">Ganti dokumen yang perlu diperbaiki, kemudian kirim ulang.</span>
        </Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Card title="Dokumen utama" actions="Berkas langsung terunggah setelah dipilih">
            <div className="grid gap-4 sm:grid-cols-2">
              {(['LED', 'LKPS'] as const).map((t) => {
                const d = doc(t);
                const pd = p?.documents.find((x) => x.documentId === d?.id);
                return <FileTile key={t} id={id} type={t} doc={d} check={pd?.check ?? d?.docCheck} aiBusy={ai === 'run'} locked={analysisActive} />;
              })}
            </div>
          </Card>
          <AiCard s={s} state={ai} />
          <SupportCard id={id} docs={support} />
        </div>
        <aside className="lg:col-span-4">
          <div className="card p-[22px] lg:sticky lg:top-24">
            <h2 className="text-base font-semibold">Siap dikirim?</h2>
            <ul className="mt-4 space-y-3 text-[14.5px]">
              {checks.map(([t, st]) => <li key={t} className="flex items-center gap-3">{CHECK_ICON[st]}<span className={st === 'todo' || st === 'opt' ? 'text-faint' : ''}>{t}</span></li>)}
            </ul>
            <div className="mt-5 border-t border-line pt-5">
              <Button size="lg" className="w-full" variant={fallback ? 'secondary' : 'primary'} disabled={!ready || (!fallback && ai !== 'done')} loading={submit.isPending} onClick={() => confirm.ask(null)}>
                {fallback ? 'Kirim tanpa skor AI' : rev ? 'Kirim perbaikan' : 'Kirim pengajuan'}
              </Button>
              <p className="mt-3 text-[13.5px] leading-relaxed text-faint">{note}</p>
            </div>
          </div>
        </aside>
      </div>
      {confirm.dialog}
    </div>
  );
}
