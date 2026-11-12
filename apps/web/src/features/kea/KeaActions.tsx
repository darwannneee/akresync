import { useForm } from 'react-hook-form';
import { MAX_TOTAL_SCORE } from '@akreditasi/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../api/client';
import { Badge, Button, DataTable, DL, Field, Input, Notice, Select, StepSection } from '../../components/ui';
import { NotesForm, RadioCards, ResultNotesForm, useConfirmed } from '../common/forms';
import { useAction } from '../common/useAction';
import { useAssessors } from '../common/queries';
import { MODE_LABEL, fmtDate, fmtNumber } from '../../lib/labels';
import type { ActionProps } from '../submissions/types';

const offerSchema = z.object({ assessor1Id: z.string().min(1, 'Pilih asesor pertama'), assessor2Id: z.string().min(1, 'Pilih asesor kedua'), leadAssessorId: z.string().min(1, 'Tetapkan ketua asesor') })
  .refine((v) => v.assessor1Id !== v.assessor2Id, { path: ['assessor2Id'], message: 'Kedua asesor harus orang yang berbeda' })
  .refine((v) => !v.leadAssessorId || [v.assessor1Id, v.assessor2Id].includes(v.leadAssessorId), { path: ['leadAssessorId'], message: 'Ketua asesor harus salah satu dari kedua asesor' });
type OV = z.infer<typeof offerSchema>;

export function OfferForm({ s, reoffer }: ActionProps & { reoffer?: boolean }) {
  const assessors = useAssessors();
  const f = useForm<OV>({ resolver: zodResolver(offerSchema), defaultValues: { assessor1Id: '', assessor2Id: '', leadAssessorId: '' } });
  const m = useAction((v: OV) => api.post(`/submissions/${s.id}/offers`, v), { title: reoffer ? 'Penawaran ulang telah dikirim' : 'Penawaran asesor telah dikirim', submissionId: s.id });
  const [a1, a2, lead] = f.watch(['assessor1Id', 'assessor2Id', 'leadAssessorId']);
  const e = f.formState.errors;
  const name = (id: string) => assessors.data?.find((a) => a.id === id)?.fullName ?? id;
  const opts = assessors.data?.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>);
  const confirm = useConfirmed<OV>({
    run: (v) => m.mutate(v), pending: m.isPending, title: 'Kirim penawaran kepada asesor?', confirmLabel: 'Ya, kirim penawaran',
    summary: (v) => [['Program studi', s.programName], ['Asesor pertama', name(v.assessor1Id)], ['Asesor kedua', name(v.assessor2Id)], ['Ketua asesor', name(v.leadAssessorId)]],
  });
  const pair = [a1, a2].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i);
  return (
    <form className="space-y-6" noValidate onSubmit={f.handleSubmit((v) => confirm.ask(v))}>
      <StepSection n={1} title="Pilih asesor pertama" done={!!a1}>
        <Field label="Asesor pertama" required error={e.assessor1Id?.message}>{(p) => <Select {...p} {...f.register('assessor1Id')}><option value="">{assessors.isLoading ? 'Memuat daftar asesor…' : 'Pilih asesor'}</option>{opts}</Select>}</Field>
      </StepSection>
      <StepSection n={2} title="Pilih asesor kedua" done={!!a2 && a2 !== a1}>
        <Field label="Asesor kedua" required error={e.assessor2Id?.message}>{(p) => <Select {...p} {...f.register('assessor2Id')}><option value="">Pilih asesor</option>{opts}</Select>}</Field>
      </StepSection>
      <StepSection n={3} title="Tetapkan ketua asesor" done={!!lead} hint="Ketua asesor memimpin Asesmen Lapangan dan menanggapi keberatan UPPS.">
        {pair.length === 2 ? <RadioCards name="lead" legend="Ketua asesor" value={lead} onChange={(v) => f.setValue('leadAssessorId', v, { shouldValidate: true })} options={pair.map((id) => ({ value: id, label: name(id) }))} /> : <p className="text-sm text-muted">Pilih kedua asesor terlebih dahulu.</p>}
        {e.leadAssessorId?.message && <p role="alert" className="mt-1 text-sm text-bad">{e.leadAssessorId.message}</p>}
      </StepSection>
      <StepSection n={4} title="Tinjau dan kirim penawaran" hint="Penugasan berlaku setelah kedua asesor dan UPPS menerima.">
        <Button type="submit" loading={m.isPending}>{reoffer ? 'Kirim penawaran ulang' : 'Kirim penawaran'}</Button>
      </StepSection>
      {confirm.dialog}
    </form>
  );
}

export function ReviewRejection({ s }: ActionProps) {
  const last = (s.offers ?? [])[(s.offers ?? []).length - 1];
  const review = useAction((notes: string) => api.post(`/offers/${last!.id}/rejection-review`, { notes }), { title: 'Tinjauan penolakan telah dicatat', submissionId: s.id });
  if (!last) return null;
  return (
    <div className="space-y-4">
      <Notice tone="warn" title={`Penawaran ke-${last.offerNo} ditolak`}>{last.rejectionReason ? `Alasan: ${last.rejectionReason}` : 'Tidak ada alasan yang dicantumkan.'}</Notice>
      <NotesForm label="Catatan tinjauan KEA" required submitLabel="Catat tinjauan" pending={review.isPending} onSubmit={(n) => review.mutate(n)} />
    </div>
  );
}

export function Consistency({ s }: ActionProps) {
  const consistency = useAction((v: { result: string; notes: string }) => api.post(`/submissions/${s.id}/ak-consistency`, v), { title: 'Pemeriksaan konsistensi telah dicatat', submissionId: s.id });
  const ak = (s.assessments ?? []).filter((a) => a.phase === 'AK' && a.status === 'submitted');
  const totals = ak.map((a) => Number(a.totalScore ?? 0));
  const diff = totals.length === 2 ? Math.abs(totals[0]! - totals[1]!) : null;
  return (
    <div className="space-y-6">
      <StepSection n={1} title="Bandingkan hasil kedua asesor" hint={`Skor total pada skala 0 sampai ${fmtNumber(MAX_TOTAL_SCORE)}.`}>
        <DataTable rows={ak} rowKey={(a) => a.id} caption="Hasil Asesmen Kecukupan"
          columns={[{ key: 'n', header: 'Asesor', primary: true, cell: (a) => a.assessorName ?? a.assessorId }, { key: 's', header: 'Status', cell: () => <Badge tone="success">Telah diserahkan</Badge> }, { key: 't', header: 'Skor total', align: 'right', cell: (a) => <b>{fmtNumber(a.totalScore)}</b> }]} />
        {diff !== null && <p className="mt-3 text-base">Selisih skor kedua asesor: <b>{fmtNumber(diff)}</b></p>}
      </StepSection>
      <StepSection n={2} title="Putuskan konsistensi">
        <ResultNotesForm submitLabel="Catat pemeriksaan konsistensi" pending={consistency.isPending} notesRequiredFor={['returned']} notesLabel="Catatan untuk asesor" notesHint="Wajib diisi bila hasil dikembalikan."
          options={[{ value: 'approved', label: 'Konsisten, setujui', hint: 'Proses dilanjutkan.' }, { value: 'returned', label: 'Kembalikan untuk dinilai ulang', hint: 'Asesor diminta memperbaiki hasilnya.' }]} onSubmit={(v) => consistency.mutate(v)} />
      </StepSection>
    </div>
  );
}

const schedSchema = z.object({
  startDate: z.string().min(1, 'Tanggal mulai wajib diisi'), endDate: z.string().min(1, 'Tanggal selesai wajib diisi'),
  location: z.string().trim().min(3, 'Lokasi wajib diisi. Contoh: Kampus Utama, Gedung Rektorat'), mode: z.enum(['luring', 'daring', 'hibrida']),
}).refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'Tanggal selesai tidak boleh sebelum tanggal mulai' });

export function ScheduleForm({ s }: ActionProps) {
  const f = useForm<z.infer<typeof schedSchema>>({ resolver: zodResolver(schedSchema), defaultValues: { mode: 'luring' } });
  const m = useAction((v: z.infer<typeof schedSchema>) => api.post(`/submissions/${s.id}/al-schedules`, v), { title: 'Usulan jadwal telah dikirim', submissionId: s.id });
  const e = f.formState.errors;
  const rejected = (s.alSchedules ?? []).filter((x) => x.status === 'rejected').slice(-1)[0];
  return (
    <form className="space-y-4" noValidate onSubmit={f.handleSubmit((v) => m.mutate(v))}>
      {rejected && <Notice tone="warn" title="Usulan sebelumnya ditolak">{rejected.notes ?? 'Perbaiki usulan sesuai catatan Sekretariat.'} (Pelaksanaan semula {fmtDate(rejected.startDate)}, {rejected.location}.)</Notice>}
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <Field label="Tanggal mulai" required error={e.startDate?.message}>{(p) => <Input {...p} type="date" {...f.register('startDate')} />}</Field>
        <Field label="Tanggal selesai" required error={e.endDate?.message}>{(p) => <Input {...p} type="date" {...f.register('endDate')} />}</Field>
        <Field label="Lokasi" required error={e.location?.message}>{(p) => <Input {...p} {...f.register('location')} />}</Field>
        <Field label="Moda pelaksanaan">{(p) => <Select {...p} {...f.register('mode')}>{(['luring', 'daring', 'hibrida'] as const).map((k) => <option key={k} value={k}>{MODE_LABEL[k]}</option>)}</Select>}</Field>
      </div>
      <Button type="submit" loading={m.isPending}>Kirim usulan jadwal</Button>
    </form>
  );
}

export function FinalVerify({ s }: ActionProps) {
  const final = useAction((notes: string) => api.post(`/submissions/${s.id}/final-verification`, { notes }), { title: 'Verifikasi akhir telah dicatat', submissionId: s.id });
  const results = (s.assessments ?? []).filter((a) => a.status === 'submitted');
  const confirm = useConfirmed<string>({
    run: (n) => final.mutate(n), pending: final.isPending, title: 'Catat verifikasi akhir?', confirmLabel: 'Ya, catat verifikasi akhir',
    summary: (n) => [['Program studi', s.programName], ['Hasil yang diperiksa', `${results.filter((a) => a.phase === 'AK').length} hasil AK dan ${results.filter((a) => a.phase === 'AL').length} hasil AL`], ['Catatan', n || '—']],
  });
  return (
    <div className="space-y-6">
      {results.length > 0 && <StepSection n={1} title="Periksa hasil penilaian"><DL cols={3} items={results.map((a) => [`${a.phase === 'AK' ? 'Kecukupan' : 'Lapangan'} · ${a.assessorName ?? 'Asesor'}`, fmtNumber(a.totalScore)] as [string, string])} /></StepSection>}
      <StepSection n={results.length ? 2 : 1} title="Catat verifikasi akhir" hint="Setelah dicatat, pengajuan diteruskan ke Majelis Akreditasi.">
        <NotesForm label="Catatan verifikasi akhir" submitLabel="Catat verifikasi akhir" pending={final.isPending} onSubmit={(n) => confirm.ask(n)} />
      </StepSection>
      {confirm.dialog}
    </div>
  );
}
