import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Check } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Field, Input, ModalActions } from '../../components/ui';
import { FormSection, KeyList, ResultNotesForm, useConfirmed } from '../common/forms';
import { useAction } from '../common/useAction';
import { MODE_LABEL, RESULT_LABEL, fmtDateRange, fmtRupiah, rankLabel } from '../../lib/labels';
import type { ActionProps } from '../submissions/types';
import { DocQuickList } from '../submissions/DocQuickList';
import { splitDocuments } from '../submissions/DocumentsPanel';

export function AdminVerify({ s }: ActionProps) {
  const id = s.id;
  const split = splitDocuments((s.documents ?? []).filter((d) => ['LED', 'LKPS', 'SUPPORT'].includes(d.docType)), s.documentSetVersion);
  const docs = split.current;
  const verify = useAction((v: { result: string; notes: string }) => api.post(`/submissions/${id}/admin-verification`, { ...v, documentSetVersion: s.documentSetVersion }), { title: 'Verifikasi kelengkapan telah dicatat', submissionId: id });
  const confirm = useConfirmed<{ result: string; notes: string }>({
    run: (v) => verify.mutate(v), pending: verify.isPending, title: 'Catat hasil verifikasi kelengkapan?', confirmLabel: 'Ya, catat hasil',
    summary: (v) => [['Program studi', s.programName], ['Hasil verifikasi', RESULT_LABEL[v.result] ?? v.result], ['Catatan', v.notes || '—'], ['Versi himpunan dokumen', s.documentSetVersion]],
  });
  const main = docs.filter((d) => d.docType === 'LED' || d.docType === 'LKPS');
  const mismatch = main.some((d) => d.docCheck?.status === 'mismatch');
  const verified = main.length > 0 && main.every((d) => d.docCheck?.status === 'verified');
  return (
    <div className="space-y-6">
      <FormSection title="Dokumen yang diperiksa" hint={`Himpunan dokumen versi ${s.documentSetVersion}. Hasil verifikasi hanya berlaku untuk versi ini.`}>
        <DocQuickList docs={docs} history={split} />
        {(verified || mismatch) && <p className={`mt-2 flex items-center gap-2 text-[13.5px] ${mismatch ? 'text-wait' : 'text-ok'}`}>{mismatch ? <AlertTriangle size={15} aria-hidden /> : <Check size={15} aria-hidden />}{mismatch ? 'Jenis dokumen perlu diperiksa menurut pemeriksaan otomatis' : 'Format dan jenis dokumen sesuai menurut pemeriksaan otomatis'}</p>}
      </FormSection>
      <ResultNotesForm submitLabel="Simpan keputusan" pending={verify.isPending} notesRequiredFor={['REVISION_REQUIRED', 'REJECTED']} notesHint="Wajib diisi bila dokumen perlu diperbaiki atau ditolak; catatan ini dibaca UPPS." notesPlaceholder="Catatan untuk UPPS"
        options={[{ value: 'APPROVED', label: 'Lengkap', hint: 'Diteruskan ke Sekretariat Keuangan untuk penerbitan tagihan.' }, { value: 'REVISION_REQUIRED', label: 'Perlu diperbaiki', hint: 'UPPS mengunggah ulang dokumen sesuai catatan.' }, { value: 'REJECTED', label: 'Ditolak', hint: 'Pengajuan dihentikan.' }]}
        onSubmit={(v) => confirm.ask(v)} />
      {confirm.dialog}
    </div>
  );
}

export function DecideSchedule({ s }: ActionProps) {
  const sched = (s.alSchedules ?? []).find((x) => x.status === 'proposed');
  const decide = useAction((v: { result: string; notes: string }) => api.post(`/al-schedules/${sched!.id}/decision`, v), { title: 'Keputusan jadwal telah dicatat', submissionId: s.id });
  const confirm = useConfirmed<{ result: string; notes: string }>({
    run: (v) => decide.mutate(v), pending: decide.isPending, title: 'Catat keputusan jadwal Asesmen Lapangan?', confirmLabel: 'Ya, catat keputusan', permanent: false,
    summary: (v) => [['Program studi', s.programName], ['Jadwal', sched ? `${fmtDateRange(sched.startDate, sched.endDate)}, ${sched.location}` : '—'], ['Keputusan', RESULT_LABEL[v.result] ?? v.result], ['Catatan', v.notes || '—']],
  });
  if (!sched) return <p className="text-[14px] text-faint">Memuat usulan jadwal…</p>;
  return (
    <div className="space-y-6">
      <FormSection title="Usulan jadwal dari KEA">
        <KeyList items={[['Tanggal pelaksanaan', fmtDateRange(sched.startDate, sched.endDate)], ['Lokasi', sched.location], ['Moda', MODE_LABEL[sched.mode] ?? sched.mode], ['Usulan ke', sched.version]]} />
      </FormSection>
      <ResultNotesForm submitLabel="Simpan keputusan" pending={decide.isPending} notesRequiredFor={['rejected']} notesHint="Wajib diisi bila jadwal ditolak, agar KEA dapat mengusulkan ulang." notesPlaceholder="Catatan untuk KEA"
        options={[{ value: 'approved', label: 'Setujui jadwal', hint: 'Jadwal Asesmen Lapangan ditetapkan sesuai usulan.' }, { value: 'rejected', label: 'Tolak jadwal', hint: 'KEA diminta mengusulkan jadwal baru.' }]} onSubmit={(v) => confirm.ask(v)} />
      {confirm.dialog}
    </div>
  );
}

export function IssueCertificate({ s }: ActionProps) {
  const issue = useAction(() => api.post(`/submissions/${s.id}/certificate`), { title: 'Sertifikat telah diterbitkan', submissionId: s.id });
  const dec = (s.records ?? []).filter((r) => r.recordType === 'DECISION').slice(-1)[0];
  const p = dec?.payload as { rank?: string; decreeNumber?: string } | undefined;
  const confirm = useConfirmed<null>({
    run: () => issue.mutate(undefined), pending: issue.isPending, title: 'Terbitkan sertifikat hasil akreditasi?', confirmLabel: 'Ya, terbitkan sertifikat', permanent: false,
    summary: () => [['Program studi', s.programName], ['Institusi', s.institutionName], ['Peringkat', p?.rank ? rankLabel(p.rank) : '—'], ['Nomor Surat Keputusan', p?.decreeNumber ?? '—']],
  });
  return (
    <div className="space-y-6">
      <FormSection title="Keputusan Majelis Akreditasi">
        <KeyList items={[['Peringkat', p?.rank ? rankLabel(p.rank) : '—'], ['Nomor Surat Keputusan', p?.decreeNumber ?? '—']]} />
      </FormSection>
      <p className="text-[14px] text-muted">Sistem akan menyusun sertifikat PDF berdasarkan peringkat dan Surat Keputusan yang telah ditetapkan Majelis. Setelah terbit, pengajuan dinyatakan selesai.</p>
      <ModalActions><Button loading={issue.isPending} onClick={() => confirm.ask(null)}>Terbitkan sertifikat</Button></ModalActions>
      {confirm.dialog}
    </div>
  );
}

const invSchema = z.object({ amount: z.coerce.number({ invalid_type_error: 'Isi jumlah tagihan dengan angka' }).positive('Jumlah tagihan harus lebih dari 0') });
export function IssueInvoice({ s }: ActionProps) {
  const f = useForm<z.input<typeof invSchema>, unknown, z.output<typeof invSchema>>({ resolver: zodResolver(invSchema) });
  const issue = useAction((v: { amount: number }) => api.post(`/submissions/${s.id}/invoice`, v), { title: 'Tagihan telah diterbitkan', submissionId: s.id, onDone: () => f.reset() });
  const amount = f.watch('amount');
  const fid = useId();
  return (
    <form id={fid} className="space-y-6" noValidate onSubmit={f.handleSubmit((v) => issue.mutate(v))}>
      <Field label="Jumlah tagihan (Rupiah)" required error={f.formState.errors.amount?.message} hint={Number(amount) > 0 ? `Terbaca: ${fmtRupiah(Number(amount))}` : 'Tuliskan angka tanpa titik atau koma. Contoh: 15000000'}>
        {(p) => <Input {...p} type="number" inputMode="numeric" min={1} step="1" {...f.register('amount')} />}
      </Field>
      <ModalActions><Button type="submit" form={fid} loading={issue.isPending}>Terbitkan tagihan</Button></ModalActions>
    </form>
  );
}

export function VerifyPayment({ s }: ActionProps) {
  const verify = useAction((v: { result: string; notes: string }) => api.post(`/submissions/${s.id}/payment-verification`, v), { title: 'Verifikasi pembayaran telah dicatat', submissionId: s.id });
  const pay = s.payments?.[0];
  const proofs = (s.documents ?? []).filter((d) => d.docType === 'PAYMENT_PROOF').slice(-1);
  const confirm = useConfirmed<{ result: string; notes: string }>({
    run: (v) => verify.mutate(v), pending: verify.isPending, title: 'Catat hasil verifikasi pembayaran?', confirmLabel: 'Ya, catat hasil', permanent: false,
    summary: (v) => [['Program studi', s.programName], ['Tagihan', pay ? `${pay.invoiceNo}, ${fmtRupiah(pay.amount)}` : '—'], ['Hasil verifikasi', v.result === 'verified' ? 'Pembayaran sah' : 'Bukti pembayaran ditolak'], ['Catatan', v.notes || '—']],
  });
  return (
    <div className="space-y-6">
      <FormSection title="Bukti pembayaran yang diperiksa" hint={pay ? `Tagihan ${pay.invoiceNo}, sebesar ${fmtRupiah(pay.amount)}.` : undefined}>
        <DocQuickList docs={proofs} empty="Bukti pembayaran belum tersedia." />
      </FormSection>
      <ResultNotesForm submitLabel="Simpan keputusan" pending={verify.isPending} notesRequiredFor={['rejected']} notesHint="Wajib diisi bila bukti ditolak; catatan ini dibaca UPPS." notesPlaceholder="Catatan untuk UPPS"
        options={[{ value: 'verified', label: 'Pembayaran sah', hint: 'Proses dilanjutkan ke penugasan asesor.' }, { value: 'rejected', label: 'Tolak bukti pembayaran', hint: 'UPPS diminta mengunggah ulang.' }]} onSubmit={(v) => confirm.ask(v)} />
      {confirm.dialog}
    </div>
  );
}
