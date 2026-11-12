import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../api/client';
import { Button, DL, Field, Input, Notice, StepSection } from '../../components/ui';
import { ResultNotesForm, useConfirmed } from '../common/forms';
import { useAction } from '../common/useAction';
import { MODE_LABEL, RESULT_LABEL, fmtDateRange, fmtRupiah } from '../../lib/labels';
import type { ActionProps } from '../submissions/types';
import { DocQuickList } from '../submissions/DocQuickList';

export function AdminVerify({ s }: ActionProps) {
  const id = s.id;
  const docs = (s.documents ?? []).filter((d) => d.setVersion === s.documentSetVersion && ['LED', 'LKPS', 'SUPPORT'].includes(d.docType));
  const verify = useAction((v: { result: string; notes: string }) => api.post(`/submissions/${id}/admin-verification`, { ...v, documentSetVersion: s.documentSetVersion }), { title: 'Verifikasi kelengkapan telah dicatat', submissionId: id });
  const confirm = useConfirmed<{ result: string; notes: string }>({
    run: (v) => verify.mutate(v), pending: verify.isPending, title: 'Catat hasil verifikasi kelengkapan?', confirmLabel: 'Ya, catat hasil',
    summary: (v) => [['Program studi', s.programName], ['Hasil verifikasi', RESULT_LABEL[v.result] ?? v.result], ['Catatan', v.notes || '—'], ['Versi himpunan dokumen', s.documentSetVersion]],
  });
  return (
    <div className="space-y-6">
      <StepSection n={1} title="Periksa dokumen yang diajukan" hint={`Himpunan dokumen versi ${s.documentSetVersion}. Hasil verifikasi hanya berlaku untuk versi ini.`}>
        <DocQuickList docs={docs} />
      </StepSection>
      <StepSection n={2} title="Catat hasil verifikasi">
        <ResultNotesForm submitLabel="Catat hasil verifikasi" pending={verify.isPending} notesRequiredFor={['REVISION_REQUIRED', 'REJECTED']} notesHint="Wajib diisi bila dokumen perlu diperbaiki atau ditolak; catatan ini dibaca UPPS."
          options={[{ value: 'APPROVED', label: 'Dokumen lengkap, setujui', hint: 'Proses dilanjutkan ke penerbitan tagihan.' }, { value: 'REVISION_REQUIRED', label: 'Perlu perbaikan', hint: 'UPPS diminta mengunggah ulang dokumen.' }, { value: 'REJECTED', label: 'Tolak pengajuan', hint: 'Proses dihentikan.' }]}
          onSubmit={(v) => confirm.ask(v)} />
      </StepSection>
      {confirm.dialog}
    </div>
  );
}

export function DecideSchedule({ s }: ActionProps) {
  const sched = (s.alSchedules ?? []).find((x) => x.status === 'proposed');
  const decide = useAction((v: { result: string; notes: string }) => api.post(`/al-schedules/${sched!.id}/decision`, v), { title: 'Keputusan jadwal telah dicatat', submissionId: s.id });
  if (!sched) return <p className="text-sm text-muted">Memuat usulan jadwal…</p>;
  return (
    <div className="space-y-5">
      <DL items={[['Tanggal pelaksanaan', fmtDateRange(sched.startDate, sched.endDate)], ['Lokasi', sched.location], ['Moda', MODE_LABEL[sched.mode] ?? sched.mode], ['Usulan ke', sched.version]]} />
      <ResultNotesForm submitLabel="Catat keputusan jadwal" pending={decide.isPending} notesRequiredFor={['rejected']} notesHint="Wajib diisi bila jadwal ditolak, agar KEA dapat mengusulkan ulang."
        options={[{ value: 'approved', label: 'Setujui jadwal' }, { value: 'rejected', label: 'Tolak jadwal' }]} onSubmit={(v) => decide.mutate(v)} />
    </div>
  );
}

export function IssueCertificate({ s }: ActionProps) {
  const issue = useAction(() => api.post(`/submissions/${s.id}/certificate`), { title: 'Sertifikat telah diterbitkan', submissionId: s.id });
  return (
    <div className="space-y-3">
      <Notice tone="info">Sistem akan menyusun sertifikat PDF berdasarkan peringkat dan Surat Keputusan yang telah ditetapkan Majelis.</Notice>
      <Button loading={issue.isPending} onClick={() => issue.mutate(undefined)}>Terbitkan sertifikat hasil akreditasi</Button>
    </div>
  );
}

const invSchema = z.object({ amount: z.coerce.number({ invalid_type_error: 'Isi jumlah tagihan dengan angka' }).positive('Jumlah tagihan harus lebih dari 0') });
export function IssueInvoice({ s }: ActionProps) {
  const f = useForm<z.input<typeof invSchema>, unknown, z.output<typeof invSchema>>({ resolver: zodResolver(invSchema) });
  const issue = useAction((v: { amount: number }) => api.post(`/submissions/${s.id}/invoice`, v), { title: 'Tagihan telah diterbitkan', submissionId: s.id, onDone: () => f.reset() });
  const amount = f.watch('amount');
  return (
    <form className="max-w-md space-y-4" noValidate onSubmit={f.handleSubmit((v) => issue.mutate(v))}>
      <Field label="Jumlah tagihan (Rupiah)" required error={f.formState.errors.amount?.message} hint={Number(amount) > 0 ? `Terbaca: ${fmtRupiah(Number(amount))}` : 'Tuliskan angka tanpa titik atau koma. Contoh: 15000000'}>
        {(p) => <Input {...p} type="number" inputMode="numeric" min={1} step="1" {...f.register('amount')} />}
      </Field>
      <Button type="submit" loading={issue.isPending}>Terbitkan tagihan</Button>
    </form>
  );
}

export function VerifyPayment({ s }: ActionProps) {
  const verify = useAction((v: { result: string; notes: string }) => api.post(`/submissions/${s.id}/payment-verification`, v), { title: 'Verifikasi pembayaran telah dicatat', submissionId: s.id });
  const pay = s.payments?.[0];
  const proofs = (s.documents ?? []).filter((d) => d.docType === 'PAYMENT_PROOF').slice(-1);
  return (
    <div className="space-y-6">
      <StepSection n={1} title="Periksa bukti pembayaran" hint={pay ? `Tagihan ${pay.invoiceNo}, sebesar ${fmtRupiah(pay.amount)}.` : undefined}>
        <DocQuickList docs={proofs} empty="Bukti pembayaran belum tersedia." />
      </StepSection>
      <StepSection n={2} title="Catat hasil verifikasi">
        <ResultNotesForm submitLabel="Catat hasil verifikasi" pending={verify.isPending} notesRequiredFor={['rejected']} notesHint="Wajib diisi bila bukti ditolak; catatan ini dibaca UPPS."
          options={[{ value: 'verified', label: 'Pembayaran sah', hint: 'Proses dilanjutkan ke penugasan asesor.' }, { value: 'rejected', label: 'Tolak bukti pembayaran', hint: 'UPPS diminta mengunggah ulang.' }]} onSubmit={(v) => verify.mutate(v)} />
      </StepSection>
    </div>
  );
}
