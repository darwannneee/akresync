import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { weightedAverage } from '@akreditasi/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../api/client';
import { Button, Choice, Field, Input, ModalActions, Notice, ScoreFigure, Select } from '../../components/ui';
import { FormSection, KeyList, NotesForm, useConfirmed } from '../common/forms';
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
  const fid = useId();
  return (
    <form id={fid} className="space-y-6" noValidate onSubmit={f.handleSubmit((v) => confirm.ask(v))}>
      <FormSection title="Pasangan asesor" hint="Penugasan berlaku setelah kedua asesor dan UPPS menerima.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Asesor pertama" required error={e.assessor1Id?.message}>{(p) => <Select {...p} {...f.register('assessor1Id')}><option value="">{assessors.isLoading ? 'Memuat daftar asesor…' : 'Pilih asesor'}</option>{opts}</Select>}</Field>
          <Field label="Asesor kedua" required error={e.assessor2Id?.message}>{(p) => <Select {...p} {...f.register('assessor2Id')}><option value="">Pilih asesor</option>{opts}</Select>}</Field>
        </div>
      </FormSection>
      <FormSection title="Ketua asesor" hint="Ketua asesor memimpin Asesmen Lapangan dan menanggapi keberatan UPPS.">
        {pair.length === 2 ? <Choice name="lead" value={lead} onChange={(v) => f.setValue('leadAssessorId', v, { shouldValidate: true })} options={pair.map((id) => ({ value: id, label: name(id) }))} /> : <p className="text-[14px] text-faint">Pilih kedua asesor terlebih dahulu.</p>}
        {e.leadAssessorId?.message && <p role="alert" className="mt-1 text-sm text-bad">{e.leadAssessorId.message}</p>}
      </FormSection>
      <ModalActions><Button type="submit" form={fid} loading={m.isPending}>{reoffer ? 'Kirim penawaran ulang' : 'Kirim penawaran'}</Button></ModalActions>
      {confirm.dialog}
    </form>
  );
}

export function ReviewRejection({ s }: ActionProps) {
  const last = (s.offers ?? [])[(s.offers ?? []).length - 1];
  const review = useAction((notes: string) => api.post(`/offers/${last!.id}/rejection-review`, { notes }), { title: 'Tinjauan penolakan telah dicatat', submissionId: s.id });
  if (!last) return null;
  return (
    <div className="space-y-6">
      <FormSection title={`Penawaran ke-${last.offerNo} ditolak`} hint={last.rejectionBy ? `Ditolak oleh ${last.rejectionBy === 'upps' ? 'UPPS' : 'asesor'}.` : undefined}>
        <p className="whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-[14.5px] text-ink">{last.rejectionReason ? last.rejectionReason : 'Tidak ada alasan yang dicantumkan.'}</p>
      </FormSection>
      <NotesForm label="Catatan tinjauan KEA" required submitLabel="Simpan tinjauan" pending={review.isPending} onSubmit={(n) => review.mutate(n)} />
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
  const fid = useId();
  return (
    <form id={fid} className="space-y-6" noValidate onSubmit={f.handleSubmit((v) => m.mutate(v))}>
      {rejected && <Notice tone="warn" title="Usulan sebelumnya ditolak">{rejected.notes ?? 'Perbaiki usulan sesuai catatan Sekretariat.'} (Pelaksanaan semula {fmtDate(rejected.startDate)}, {rejected.location}.)</Notice>}
      <FormSection title="Waktu pelaksanaan">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal mulai" required error={e.startDate?.message}>{(p) => <Input {...p} type="date" {...f.register('startDate')} />}</Field>
          <Field label="Tanggal selesai" required error={e.endDate?.message}>{(p) => <Input {...p} type="date" {...f.register('endDate')} />}</Field>
        </div>
      </FormSection>
      <FormSection title="Tempat dan moda">
        <div className="space-y-4">
          <Field label="Lokasi" required error={e.location?.message}>{(p) => <Input {...p} placeholder="Contoh: Kampus Utama, Gedung Rektorat" {...f.register('location')} />}</Field>
          <Field label="Moda pelaksanaan">{(p) => <Select {...p} {...f.register('mode')}>{(['luring', 'daring', 'hibrida'] as const).map((k) => <option key={k} value={k}>{MODE_LABEL[k]}</option>)}</Select>}</Field>
        </div>
      </FormSection>
      <ModalActions><Button type="submit" form={fid} loading={m.isPending}>Kirim usulan jadwal</Button></ModalActions>
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
      {results.length > 0 && (
        <FormSection title="Hasil penilaian yang diperiksa" hint="Rata-rata berbobot pada skala 0 sampai 4; skor total berbobot dalam kurung.">
          <KeyList items={results.map((a) => [`${a.phase === 'AK' ? 'Asesmen Kecukupan' : 'Asesmen Lapangan'} · ${a.assessorName ?? 'Asesor'}`, <span key={a.id} className="tabular-nums"><ScoreFigure size="sm" value={weightedAverage(a.scores ?? {})} /> <span className="text-[13px] text-faint">({fmtNumber(a.totalScore)})</span></span>] as [string, React.ReactNode])} />
        </FormSection>
      )}
      <p className="text-[14px] text-muted">Setelah dicatat, pengajuan diteruskan ke Majelis Akreditasi.</p>
      <NotesForm label="Catatan verifikasi akhir" submitLabel="Simpan verifikasi akhir" pending={final.isPending} onSubmit={(n) => confirm.ask(n)} />
      {confirm.dialog}
    </div>
  );
}
