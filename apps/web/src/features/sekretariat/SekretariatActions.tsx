import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../api/client';
import { Badge, Button, Card, DL, Field, Input } from '../../components/ui';
import { ResultNotesForm } from '../common/forms';
import { useAction } from '../common/useAction';
import { fmtDate, fmtRupiah } from '../common/labels';
import type { ActionProps } from '../submissions/types';
import { DecisionView } from '../upps/UppsActions';

export function AdmActions({ s, user }: ActionProps) {
  const id = s.id;
  const verify = useAction((v: { result: string; notes: string }) => api.post(`/submissions/${id}/admin-verification`, { ...v, documentSetVersion: s.documentSetVersion }), { title: 'Verifikasi administrasi dicatat', submissionId: id });
  const sched = (s.alSchedules ?? []).find((x) => x.status === 'proposed');
  const decide = useAction((v: { result: string; notes: string }) => api.post(`/al-schedules/${sched!.id}/decision`, v), { title: 'Keputusan jadwal AL dicatat', submissionId: id });
  const issue = useAction(() => api.post(`/submissions/${id}/certificate`), { title: 'Sertifikat diterbitkan', submissionId: id });
  return (
    <>
      {s.stage === 'submitted' && (
        <Card title="Verifikasi kelengkapan administrasi">
          <p className="mb-3 text-sm"><Badge tone="accent">Versi set dokumen: {s.documentSetVersion}</Badge> <span className="text-slate-600">Hasil verifikasi dicatat untuk versi ini dan akan ditolak bila tidak sama dengan pengajuan terakhir.</span></p>
          <ResultNotesForm submitLabel="Catat verifikasi" pending={verify.isPending} notesRequiredFor={['REVISION_REQUIRED', 'REJECTED']}
            options={[{ value: 'APPROVED', label: 'Disetujui' }, { value: 'REVISION_REQUIRED', label: 'Perlu revisi' }, { value: 'REJECTED', label: 'Ditolak' }]}
            onSubmit={(v) => verify.mutate(v)} />
        </Card>
      )}
      {sched && (
        <Card title="Persetujuan jadwal asesmen lapangan (AL)">
          <DL items={[['Tanggal', `${sched.startDate} s.d. ${sched.endDate}`], ['Lokasi', sched.location], ['Moda', sched.mode], ['Versi usulan', sched.version]]} />
          <div className="mt-3"><ResultNotesForm submitLabel="Catat keputusan jadwal" pending={decide.isPending} notesRequiredFor={['rejected']}
            options={[{ value: 'approved', label: 'Setujui jadwal' }, { value: 'rejected', label: 'Tolak jadwal' }]} onSubmit={(v) => decide.mutate(v)} /></div>
        </Card>
      )}
      {s.stage === 'decided' && !s.certificate && (
        <Card title="Penerbitan hasil akreditasi">
          <p className="mb-3 text-sm text-slate-600">Keputusan Majelis telah tercatat. Terbitkan sertifikat/hasil dalam bentuk PDF.</p>
          <Button variant="accent" loading={issue.isPending} onClick={() => issue.mutate(undefined)}>Terbitkan sertifikat</Button>
        </Card>
      )}
      {(s.stage === 'decided' || s.stage === 'released') && s.certificate && <DecisionView s={s} user={user} />}
    </>
  );
}

const invSchema = z.object({ amount: z.coerce.number({ invalid_type_error: 'Isi jumlah tagihan' }).positive('Jumlah harus lebih dari 0') });
export function KeuActions({ s }: ActionProps) {
  const id = s.id;
  const f = useForm<z.input<typeof invSchema>, unknown, z.output<typeof invSchema>>({ resolver: zodResolver(invSchema) });
  const issue = useAction((v: { amount: number }) => api.post(`/submissions/${id}/invoice`, v), { title: 'Tagihan diterbitkan', submissionId: id, onDone: () => f.reset() });
  const verify = useAction((v: { result: string; notes: string }) => api.post(`/submissions/${id}/payment-verification`, v), { title: 'Verifikasi pembayaran dicatat', submissionId: id });
  const pay = s.payments?.[0];
  return (
    <>
      {s.stage === 'admin_verified' && (
        <Card title="Terbitkan tagihan">
          <form className="max-w-sm space-y-3" noValidate onSubmit={f.handleSubmit((v) => issue.mutate(v))}>
            <Field label="Jumlah tagihan (Rp)" error={f.formState.errors.amount?.message}>{(i) => <Input id={i} type="number" inputMode="numeric" min={1} step="1" {...f.register('amount')} />}</Field>
            <Button type="submit" loading={issue.isPending}>Terbitkan tagihan</Button>
          </form>
        </Card>
      )}
      {pay && <Card title="Tagihan"><DL items={[['Nomor', pay.invoiceNo], ['Jumlah', fmtRupiah(pay.amount)], ['Status', pay.status], ['Diterbitkan', fmtDate(pay.issuedAt)], ['Catatan', pay.notes]]} /></Card>}
      {s.stage === 'payment_proof_uploaded' && (
        <Card title="Verifikasi bukti pembayaran">
          <p className="mb-3 text-sm text-slate-600">Unduh bukti pembayaran pada bagian “Dokumen” di bawah, lalu catat hasil verifikasi.</p>
          <ResultNotesForm submitLabel="Catat verifikasi" pending={verify.isPending} notesRequiredFor={['rejected']}
            options={[{ value: 'verified', label: 'Terverifikasi' }, { value: 'rejected', label: 'Ditolak' }]} onSubmit={(v) => verify.mutate(v)} />
        </Card>
      )}
    </>
  );
}
