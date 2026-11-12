import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../api/client';
import { Button, DL, Field, ModalActions, Notice, StepSection, Textarea } from '../../components/ui';
import { RadioCards, SingleUpload, useConfirmed } from '../common/forms';
import { useAction } from '../common/useAction';
import { DOC_TYPE_LABEL, PAYMENT_STATUS_LABEL, fmtBytes, fmtRupiah } from '../../lib/labels';
import { AiProgressCard } from '../ai/ProgressCard';
import type { ActionProps } from '../submissions/types';

/** Penyusunan pengajuan: LED, LKPS, pendukung, lalu kirim. Juga dipakai untuk perbaikan dokumen. */
export function ComposeSubmission({ s }: ActionProps) {
  const id = s.id;
  const rev = s.stage === 'admin_revision';
  const docs = (s.documents ?? []).filter((d) => d.setVersion === s.documentSetVersion);
  const of = (t: string) => docs.filter((d) => d.docType === t);
  const hasMain = of('LED').length > 0 && of('LKPS').length > 0;
  const upload = useAction((v: { file: File; docType: string }) => {
    const f = new FormData(); f.append('file', v.file); f.append('docType', v.docType);
    return api.upload(`/submissions/${id}/documents`, f);
  }, { title: 'Dokumen berhasil diunggah', submissionId: id });
  const submit = useAction(() => api.post(`/submissions/${id}/submit`), { title: rev ? 'Perbaikan dokumen telah dikirim' : 'Pengajuan resmi telah dikirim', submissionId: id });
  const confirm = useConfirmed<null>({
    run: () => submit.mutate(undefined), pending: submit.isPending, title: rev ? 'Kirim perbaikan dokumen?' : 'Kirim pengajuan resmi?', confirmLabel: rev ? 'Ya, kirim perbaikan' : 'Ya, kirim pengajuan',
    summary: () => [['Program studi', s.programName ? `${s.programName}${s.programLevel ? ` (${s.programLevel})` : ''}` : '—'], ['Institusi', s.institutionName], ['Dokumen utama', `LED: ${of('LED')[0]?.fileName ?? '—'}; LKPS: ${of('LKPS')[0]?.fileName ?? '—'}`], ['Dokumen pendukung', `${of('SUPPORT').length} berkas`], ['Versi himpunan dokumen', s.documentSetVersion]],
  });
  const slot = (n: number, type: 'LED' | 'LKPS' | 'SUPPORT', hint: string, optional?: boolean) => {
    const list = of(type);
    return (
      <StepSection n={n} title={`${DOC_TYPE_LABEL[type]}${optional ? ' (opsional)' : ''}`} done={list.length > 0 && !optional} hint={hint}>
        {list.length > 0 && <div className="mb-3"><Notice tone="success">{list.map((d) => `${d.fileName} (${fmtBytes(d.sizeBytes)})`).join('; ')} sudah terunggah.{!optional && ' Unggah berkas baru bila ingin menggantinya.'}</Notice></div>}
        <SingleUpload label={list.length ? 'Ganti atau tambah berkas' : 'Pilih berkas'} hint={type === 'SUPPORT' ? undefined : 'Jenis berkas diperiksa otomatis oleh AI saat diunggah (beberapa detik). Berkas yang bukan jenis ini akan ditolak. Bila layanan AI sibuk, berkas tetap diterima dan diperiksa ulang kemudian.'} submitLabel={`Unggah ${type === 'SUPPORT' ? 'dokumen pendukung' : type}`} pending={upload.isPending && upload.variables?.docType === type} onSubmit={(file) => upload.mutate({ file, docType: type })} />
      </StepSection>
    );
  };
  return (
    <div className="space-y-6">
      {rev && <Notice tone="warn" title="Sekretariat meminta perbaikan">Lihat catatan pada tab Catatan resmi, unggah dokumen yang diperbaiki (LED dan LKPS wajib ada pada versi baru), kemudian kirim ulang.</Notice>}
      {slot(1, 'LED', 'Dokumen utama berisi evaluasi diri program studi.')}
      {slot(2, 'LKPS', 'Dokumen utama berisi data kinerja program studi.')}
      <AiProgressCard p={s.aiProgress} />
      {slot(3, 'SUPPORT', 'Berkas lain yang menunjang, misalnya surat tugas atau bukti kerja sama.', true)}
      <StepSection n={4} title={rev ? 'Tinjau dan kirim perbaikan' : 'Tinjau dan kirim pengajuan resmi'} hint={hasMain ? 'Dokumen utama sudah lengkap. Periksa sekali lagi sebelum mengirim.' : 'Tombol kirim aktif setelah LED dan LKPS terunggah.'}>
        <ModalActions><Button disabled={!hasMain} loading={submit.isPending} onClick={() => confirm.ask(null)}>{rev ? 'Kirim Perbaikan Dokumen' : 'Kirim Pengajuan Resmi'}</Button></ModalActions>
      </StepSection>
      {confirm.dialog}
    </div>
  );
}

export function UploadProof({ s }: ActionProps) {
  const pay = s.payments?.[0];
  const proof = useAction((v: { file: File }) => { const f = new FormData(); f.append('file', v.file); return api.upload(`/submissions/${s.id}/payment-proof`, f); }, { title: 'Bukti pembayaran telah diunggah', submissionId: s.id });
  return (
    <div className="space-y-6">
      <StepSection n={1} title="Periksa tagihan" done={!!pay}>
        {pay ? <DL items={[['Nomor tagihan', pay.invoiceNo], ['Jumlah yang harus dibayar', <b key="a">{fmtRupiah(pay.amount)}</b>], ['Status', PAYMENT_STATUS_LABEL[pay.status] ?? pay.status], ['Catatan Sekretariat', pay.notes]]} /> : <p className="text-sm text-muted">Memuat tagihan…</p>}
        {pay?.status === 'rejected' && <div className="mt-3"><Notice tone="warn" title="Bukti pembayaran sebelumnya ditolak">Baca catatan di atas, lalu unggah bukti pembayaran yang benar.</Notice></div>}
      </StepSection>
      <StepSection n={2} title="Unggah bukti pembayaran" hint="Berkas berupa bukti transfer atau kuitansi.">
        <SingleUpload label="Bukti pembayaran" submitLabel="Unggah bukti pembayaran" pending={proof.isPending} onSubmit={(file) => proof.mutate({ file })} />
      </StepSection>
    </div>
  );
}

const respSchema = z.object({ response: z.enum(['ACCEPT', 'REJECT']), reason: z.string().trim() })
  .refine((v) => v.response === 'ACCEPT' || v.reason.length >= 5, { path: ['reason'], message: 'Alasan penolakan wajib diisi (minimal 5 huruf) agar KEA dapat menindaklanjuti.' });

export function OfferResponseForm({ offerId, submissionId, title, who }: { offerId: string; submissionId: string; title: string; who: string }) {
  const f = useForm<z.infer<typeof respSchema>>({ resolver: zodResolver(respSchema), defaultValues: { response: 'ACCEPT', reason: '' } });
  const m = useAction((v: z.infer<typeof respSchema>) => api.post(`/offers/${offerId}/responses`, v), { title, submissionId });
  const v = f.watch('response');
  const fid = useId();
  const confirm = useConfirmed<z.infer<typeof respSchema>>({
    run: (x) => m.mutate(x), pending: m.isPending, title: 'Kirim tanggapan penugasan?', confirmLabel: 'Ya, kirim tanggapan',
    summary: (x) => [['Tanggapan', x.response === 'ACCEPT' ? 'Menerima penugasan' : 'Menolak penugasan'], ...(x.reason ? [['Alasan', x.reason] as [string, string]] : []), ['Penanggap', who]],
  });
  return (
    <form id={fid} className="space-y-4" noValidate onSubmit={f.handleSubmit((x) => confirm.ask(x))}>
      <RadioCards name="response" legend="Tanggapan Bapak/Ibu" value={v} onChange={(x) => f.setValue('response', x as 'ACCEPT' | 'REJECT')} options={[{ value: 'ACCEPT', label: 'Menerima penugasan', hint: 'Penugasan berlaku bila semua pihak menerima.' }, { value: 'REJECT', label: 'Menolak penugasan', hint: 'KEA akan meninjau dan menawarkan pasangan lain.' }]} />
      <Field label="Alasan" required={v === 'REJECT'} hint={v === 'REJECT' ? 'Wajib diisi bila menolak.' : 'Opsional.'} error={f.formState.errors.reason?.message}>{(p) => <Textarea {...p} {...f.register('reason')} />}</Field>
      <ModalActions><Button type="submit" form={fid} loading={m.isPending}>Kirim Tanggapan</Button></ModalActions>
      {confirm.dialog}
    </form>
  );
}

export function UppsOfferResponse({ s, user }: ActionProps) {
  const offer = [...(s.offers ?? [])].reverse().find((o) => o.status === 'offered');
  if (!offer) return null;
  return (
    <div className="space-y-4">
      <Notice tone="info" title="Pasangan asesor yang diusulkan">{[offer.assessor1Name, offer.assessor2Name].filter(Boolean).join(' dan ') || 'Lihat tab Penugasan dan Penilaian.'}{offer.leadAssessorName ? `. Ketua asesor: ${offer.leadAssessorName}.` : ''}</Notice>
      <OfferResponseForm offerId={offer.id} submissionId={s.id} title="Tanggapan penawaran telah dikirim" who={user.fullName} />
    </div>
  );
}

export function UppsResponse({ s }: ActionProps) {
  const m = useAction((v: { type: 'accept' | 'objection'; body: string }) => api.post(`/submissions/${s.id}/responses`, v), { title: 'Tanggapan UPPS telah disampaikan', submissionId: s.id });
  const [type, setType] = useState<'accept' | 'objection'>('accept');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const fid = useId();
  const al = (s.assessments ?? []).filter((a) => a.phase === 'AL');
  return (
    <form id={fid} className="space-y-4" noValidate onSubmit={(e) => {
      e.preventDefault();
      if (type === 'objection' && body.trim().length < 5) { setErr('Uraikan keberatan Bapak/Ibu (minimal 5 huruf) agar dapat ditanggapi ketua asesor.'); return; }
      setErr(null); m.mutate({ type, body: body.trim() || 'Menerima hasil asesmen.' });
    }}>
      {al.length > 0 && <DL items={al.map((a) => [a.assessorName ?? 'Ketua asesor', `Skor Asesmen Lapangan: ${a.totalScore ?? '—'}`] as [string, string])} />}
      <RadioCards name="type" legend="Sikap UPPS atas hasil asesmen" value={type} onChange={(v) => { setType(v as 'accept' | 'objection'); setErr(null); }} options={[{ value: 'accept', label: 'Menerima hasil', hint: 'Proses dilanjutkan ke verifikasi akhir.' }, { value: 'objection', label: 'Mengajukan keberatan', hint: 'Ketua asesor akan menanggapi keberatan.' }]} />
      <Field label={type === 'objection' ? 'Uraian keberatan' : 'Catatan'} required={type === 'objection'} hint={type === 'objection' ? 'Sebutkan butir atau temuan yang dikeberatkan beserta alasannya.' : 'Opsional.'} error={err ?? undefined}>{(p) => <Textarea {...p} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      <ModalActions><Button type="submit" form={fid} loading={m.isPending}>Sampaikan Tanggapan</Button></ModalActions>
    </form>
  );
}

