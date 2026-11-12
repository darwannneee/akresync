import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../api/client';
import { Badge, Button, Card, Field, Input, Select, Table, Td } from '../../components/ui';
import { NotesForm, ResultNotesForm } from '../common/forms';
import { useAction } from '../common/useAction';
import { useAssessors } from '../common/queries';
import type { ActionProps } from '../submissions/types';

const offerSchema = z.object({ assessor1Id: z.string().min(1, 'Pilih asesor 1'), assessor2Id: z.string().min(1, 'Pilih asesor 2'), leadAssessorId: z.string().min(1, 'Pilih ketua asesor') })
  .refine((v) => v.assessor1Id !== v.assessor2Id, { path: ['assessor2Id'], message: 'Kedua asesor harus berbeda' })
  .refine((v) => !v.leadAssessorId || [v.assessor1Id, v.assessor2Id].includes(v.leadAssessorId), { path: ['leadAssessorId'], message: 'Ketua harus salah satu dari kedua asesor' });

function OfferForm({ s, reoffer }: { s: ActionProps['s']; reoffer: boolean }) {
  const assessors = useAssessors();
  const f = useForm<z.infer<typeof offerSchema>>({ resolver: zodResolver(offerSchema), defaultValues: { assessor1Id: '', assessor2Id: '', leadAssessorId: '' } });
  const m = useAction((v: z.infer<typeof offerSchema>) => api.post(`/submissions/${s.id}/offers`, v), { title: reoffer ? 'Penawaran ulang dikirim' : 'Penawaran asesor dikirim', submissionId: s.id });
  const [a1, a2] = f.watch(['assessor1Id', 'assessor2Id']);
  const e = f.formState.errors;
  const opts = <>{assessors.data?.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}</>;
  return (
    <Card title={reoffer ? 'Tawarkan ulang pasangan asesor' : 'Tawarkan pasangan asesor'}>
      <form className="grid max-w-2xl gap-3 sm:grid-cols-3" noValidate onSubmit={f.handleSubmit((v) => m.mutate(v))}>
        <Field label="Asesor 1" error={e.assessor1Id?.message}>{(id) => <Select id={id} {...f.register('assessor1Id')}><option value="">Pilih…</option>{opts}</Select>}</Field>
        <Field label="Asesor 2" error={e.assessor2Id?.message}>{(id) => <Select id={id} {...f.register('assessor2Id')}><option value="">Pilih…</option>{opts}</Select>}</Field>
        <Field label="Ketua asesor" error={e.leadAssessorId?.message}>
          {(id) => <Select id={id} {...f.register('leadAssessorId')}><option value="">Pilih…</option>{assessors.data?.filter((a) => a.id === a1 || a.id === a2).map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}</Select>}
        </Field>
        <div className="sm:col-span-3"><Button type="submit" loading={m.isPending}>Kirim penawaran</Button></div>
      </form>
    </Card>
  );
}

const schedSchema = z.object({
  startDate: z.string().min(1, 'Tanggal mulai wajib diisi'), endDate: z.string().min(1, 'Tanggal selesai wajib diisi'),
  location: z.string().trim().min(3, 'Lokasi wajib diisi'), mode: z.enum(['luring', 'daring', 'hibrida']),
}).refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'Tidak boleh sebelum tanggal mulai' });

function ScheduleForm({ s }: { s: ActionProps['s'] }) {
  const f = useForm<z.infer<typeof schedSchema>>({ resolver: zodResolver(schedSchema), defaultValues: { mode: 'luring' } });
  const m = useAction((v: z.infer<typeof schedSchema>) => api.post(`/submissions/${s.id}/al-schedules`, v), { title: 'Usulan jadwal AL dikirim', submissionId: s.id });
  const e = f.formState.errors;
  return (
    <Card title={s.alScheduleStatus === 'rejected' ? 'Usulkan ulang jadwal AL' : 'Usulkan jadwal asesmen lapangan (AL)'}>
      <form className="grid max-w-2xl gap-3 sm:grid-cols-2" noValidate onSubmit={f.handleSubmit((v) => m.mutate(v))}>
        <Field label="Tanggal mulai" error={e.startDate?.message}>{(id) => <Input id={id} type="date" {...f.register('startDate')} />}</Field>
        <Field label="Tanggal selesai" error={e.endDate?.message}>{(id) => <Input id={id} type="date" {...f.register('endDate')} />}</Field>
        <Field label="Lokasi" error={e.location?.message}>{(id) => <Input id={id} {...f.register('location')} />}</Field>
        <Field label="Moda">{(id) => <Select id={id} {...f.register('mode')}><option value="luring">Luring</option><option value="daring">Daring</option><option value="hibrida">Hibrida</option></Select>}</Field>
        <div className="sm:col-span-2"><Button type="submit" loading={m.isPending}>Kirim usulan</Button></div>
      </form>
    </Card>
  );
}

export function KeaActions({ s }: ActionProps) {
  const id = s.id;
  const offers = s.offers ?? [];
  const last = offers[offers.length - 1];
  const rejectedPending = last?.status === 'rejected' && !last.rejectionReviewedAt;
  const review = useAction((notes: string) => api.post(`/offers/${last!.id}/rejection-review`, { notes }), { title: 'Tinjauan penolakan dicatat', submissionId: id });
  const consistency = useAction((v: { result: string; notes: string }) => api.post(`/submissions/${id}/ak-consistency`, v), { title: 'Konsistensi AK dicatat', submissionId: id });
  const final = useAction((notes: string) => api.post(`/submissions/${id}/final-verification`, { notes }), { title: 'Verifikasi akhir dicatat', submissionId: id });
  const inBranch = s.stage === 'payment_verified' || s.stage === 'in_assessment';
  const ak = (s.assessments ?? []).filter((a) => a.phase === 'AK' && a.status === 'submitted');
  const totals = ak.map((a) => Number(a.totalScore ?? 0));
  const diff = totals.length === 2 ? Math.abs(totals[0]! - totals[1]!) : null;

  return (
    <>
      {inBranch && s.akStatus === 'not_started' && <OfferForm s={s} reoffer={false} />}
      {inBranch && s.akStatus === 'offer_rejected' && rejectedPending && (
        <Card title="Tinjau penolakan penawaran">
          <p className="mb-3 text-sm text-slate-700">Penawaran ke-{last!.offerNo} ditolak. {last!.rejectionReason && <>Alasan: <i>{last!.rejectionReason}</i></>}</p>
          <NotesForm label="Catatan tinjauan" required submitLabel="Catat tinjauan" pending={review.isPending} onSubmit={(n) => review.mutate(n)} />
        </Card>
      )}
      {inBranch && s.akStatus === 'offer_rejected' && !rejectedPending && <OfferForm s={s} reoffer />}
      {inBranch && s.akStatus === 'ak_complete' && (
        <Card title="Konsistensi hasil AK">
          <Table head={['Asesor', 'Status', 'Skor total (0–400)']}>
            {ak.map((a) => <tr key={a.id}><Td>{a.assessorName ?? a.assessorId}</Td><Td><Badge tone="success">Dikirim</Badge></Td><Td className="font-semibold">{a.totalScore}</Td></tr>)}
          </Table>
          {diff !== null && <p className="mt-2 text-sm">Selisih skor kedua asesor: <b>{diff.toFixed(2)}</b></p>}
          <div className="mt-3"><ResultNotesForm submitLabel="Catat konsistensi" pending={consistency.isPending} notesRequiredFor={['returned']} notesLabel="Catatan untuk asesor"
            options={[{ value: 'approved', label: 'Setujui (konsisten)' }, { value: 'returned', label: 'Kembalikan untuk penilaian ulang' }]} onSubmit={(v) => consistency.mutate(v)} /></div>
        </Card>
      )}
      {s.akStatus === 'consistency_returned' && <Card title="AK dikembalikan"><p className="text-sm">Hasil AK dikembalikan ke asesor untuk dinilai ulang melalui koreksi catatan. {last?.consistencyNotes && <>Catatan: <i>{last.consistencyNotes}</i></>}</p></Card>}
      {inBranch && (s.alScheduleStatus === 'not_started' || s.alScheduleStatus === 'rejected') && <ScheduleForm s={s} />}
      {inBranch && s.alScheduleStatus === 'proposed' && <Card title="Jadwal AL"><p className="text-sm">Usulan jadwal menunggu persetujuan Sekretariat Administrasi.</p></Card>}
      {s.stage === 'responses_completed' && (
        <Card title="Verifikasi akhir">
          <p className="mb-3 text-sm text-slate-600">Tanggapan UPPS telah selesai. Rujuk hasil AL dan kedua hasil AK, lalu catat verifikasi akhir.</p>
          <NotesForm label="Catatan verifikasi akhir (opsional)" submitLabel="Catat verifikasi akhir" pending={final.isPending} onSubmit={(n) => final.mutate(n)} />
        </Card>
      )}
      {offers.length > 0 && (
        <Card title="Riwayat penawaran asesor">
          <Table head={['No.', 'Asesor', 'Ketua', 'Status', 'Respons']}>
            {offers.map((o) => <tr key={o.id}><Td>{o.offerNo}</Td><Td>{o.assessor1Name ?? o.assessor1Id}, {o.assessor2Name ?? o.assessor2Id}</Td><Td>{o.leadAssessorName ?? o.leadAssessorId}</Td><Td>{o.status}</Td>
              <Td className="text-xs">A1: {o.assessor1Response ?? '—'} · A2: {o.assessor2Response ?? '—'} · UPPS: {o.uppsResponse ?? '—'}</Td></tr>)}
          </Table>
        </Card>
      )}
    </>
  );
}
