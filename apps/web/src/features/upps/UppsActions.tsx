import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../api/client';
import { Download } from 'lucide-react';
import { Button, Field, ModalActions, Notice, Textarea } from '../../components/ui';
import { FormSection, KeyList, RadioCards, SingleUpload, useConfirmed } from '../common/forms';
import { useAction, useDownload } from '../common/useAction';
import { PAYMENT_STATUS_LABEL, fmtBytes, fmtDateTime, fmtNumber, fmtRupiah, fmtScore, scoreFromTotal } from '../../lib/labels';
import type { ActionProps } from '../submissions/types';

export function UploadProof({ s }: ActionProps) {
  const pay = s.payments?.[0];
  const proof = useAction((v: { file: File }) => { const f = new FormData(); f.append('file', v.file); return api.upload(`/submissions/${s.id}/payment-proof`, f); }, { title: 'Bukti pembayaran telah diunggah', submissionId: s.id });
  return (
    <div className="space-y-6">
      <FormSection title="Tagihan">
        {pay ? <KeyList items={[['Nomor tagihan', pay.invoiceNo], ['Jumlah yang harus dibayar', <b key="a" className="font-semibold">{fmtRupiah(pay.amount)}</b>], ['Status', PAYMENT_STATUS_LABEL[pay.status] ?? pay.status], ...(pay.notes ? [['Catatan Sekretariat', pay.notes] as [string, string]] : [])]} /> : <p className="text-[14px] text-faint">Memuat tagihan…</p>}
        {pay?.status === 'rejected' && <div className="mt-3"><Notice tone="warn" title="Bukti pembayaran sebelumnya ditolak">Baca catatan Sekretariat di atas, lalu unggah bukti pembayaran yang benar.</Notice></div>}
      </FormSection>
      <FormSection title="Bukti pembayaran" hint="Berkas berupa bukti transfer atau kuitansi.">
        <SingleUpload footer label="Berkas bukti pembayaran" submitLabel="Unggah bukti pembayaran" pending={proof.isPending} onSubmit={(file) => proof.mutate({ file })} />
      </FormSection>
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
    <form id={fid} className="space-y-6" noValidate onSubmit={f.handleSubmit((x) => confirm.ask(x))}>
      <RadioCards name="response" legend="Tanggapan" value={v} onChange={(x) => f.setValue('response', x as 'ACCEPT' | 'REJECT')} options={[{ value: 'ACCEPT', label: 'Menerima penugasan', hint: 'Penugasan berlaku bila semua pihak menerima.' }, { value: 'REJECT', label: 'Menolak penugasan', hint: 'KEA akan meninjau dan menawarkan pasangan lain.' }]} />
      <Field label={<>Alasan{v !== 'REJECT' && <span className="font-normal text-faint"> (opsional)</span>}</>} required={v === 'REJECT'} hint={v === 'REJECT' ? 'Wajib diisi bila menolak.' : undefined} error={f.formState.errors.reason?.message}>{(p) => <Textarea {...p} {...f.register('reason')} />}</Field>
      <ModalActions><Button type="submit" form={fid} loading={m.isPending}>Simpan tanggapan</Button></ModalActions>
      {confirm.dialog}
    </form>
  );
}

export function UppsOfferResponse({ s, user }: ActionProps) {
  const offer = [...(s.offers ?? [])].reverse().find((o) => o.status === 'offered');
  if (!offer) return null;
  return (
    <div className="space-y-6">
      <FormSection title="Pasangan asesor yang diusulkan" hint={`Penawaran ke-${offer.offerNo} dari KEA.`}>
        <KeyList items={[['Asesor pertama', offer.assessor1Name ?? '—'], ['Asesor kedua', offer.assessor2Name ?? '—'], ['Ketua asesor', offer.leadAssessorName ?? '—']]} />
      </FormSection>
      <OfferResponseForm offerId={offer.id} submissionId={s.id} title="Tanggapan penawaran telah dikirim" who={user.fullName} />
    </div>
  );
}

export function UppsResponse({ s }: ActionProps) {
  const m = useAction((v: { type: 'accept' | 'objection'; body: string }) => api.post(`/submissions/${s.id}/responses`, v), { title: 'Tanggapan UPPS telah disampaikan', submissionId: s.id });
  const download = useDownload();
  const [type, setType] = useState<'accept' | 'objection'>('accept');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const fid = useId();
  const al = (s.assessments ?? []).filter((a) => a.phase === 'AL' && a.status === 'submitted');
  const minutes = (s.documents ?? []).filter((d) => d.docType === 'AL_MINUTES').slice(-1)[0];
  const confirm = useConfirmed<{ type: 'accept' | 'objection'; body: string }>({
    run: (v) => m.mutate(v), pending: m.isPending, title: 'Sampaikan tanggapan atas hasil asesmen?', confirmLabel: 'Ya, sampaikan tanggapan',
    summary: (v) => [['Sikap UPPS', v.type === 'accept' ? 'Menerima hasil' : 'Mengajukan keberatan'], [v.type === 'accept' ? 'Catatan' : 'Uraian keberatan', v.body]],
  });
  return (
    <form id={fid} className="space-y-6" noValidate onSubmit={(e) => {
      e.preventDefault();
      if (type === 'objection' && body.trim().length < 5) { setErr('Uraikan keberatan Bapak/Ibu (minimal 5 huruf) agar dapat ditanggapi ketua asesor.'); return; }
      setErr(null); confirm.ask({ type, body: body.trim() || 'Menerima hasil asesmen.' });
    }}>
      <FormSection title="Hasil Asesmen Lapangan" hint="Skor total dan Berita Acara. Skor rinci per butir tidak ditampilkan kepada UPPS.">
        {al.length > 0
          ? <KeyList items={[...al.map((a) => [`Skor oleh ${a.assessorName ?? 'ketua asesor'}`, <span key={a.id} className="tabular-nums"><b className="font-semibold">{fmtScore(scoreFromTotal(a.totalScore))}</b> <span className="text-faint">/ 4,00 (total {fmtNumber(a.totalScore)})</span></span>] as [string, React.ReactNode]), ...(al[0]?.submittedAt ? [['Diserahkan', fmtDateTime(al[0].submittedAt)] as [string, React.ReactNode]] : [])]} />
          : <p className="text-[14px] text-faint">Hasil Asesmen Lapangan belum dapat ditampilkan. Muat ulang halaman bila perlu.</p>}
        {minutes && <Button variant="ghost" size="sm" className="-ml-3 mt-2" icon={<Download size={15} />} onClick={() => download(`/documents/${minutes.id}/download`, minutes.fileName)}>Unduh Berita Acara ({fmtBytes(minutes.sizeBytes)})</Button>}
      </FormSection>
      <RadioCards name="type" legend="Sikap UPPS atas hasil asesmen" value={type} onChange={(v) => { setType(v as 'accept' | 'objection'); setErr(null); }} options={[{ value: 'accept', label: 'Menerima hasil', hint: 'Proses dilanjutkan ke verifikasi akhir.' }, { value: 'objection', label: 'Mengajukan keberatan', hint: 'Ketua asesor akan menanggapi keberatan.' }]} />
      <Field label={type === 'objection' ? 'Uraian keberatan' : <>Catatan<span className="font-normal text-faint"> (opsional)</span></>} required={type === 'objection'} hint={type === 'objection' ? 'Sebutkan butir atau temuan yang dikeberatkan beserta alasannya.' : undefined} error={err ?? undefined}>{(p) => <Textarea {...p} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      <ModalActions><Button type="submit" form={fid} loading={m.isPending}>Sampaikan tanggapan</Button></ModalActions>
      {confirm.dialog}
    </form>
  );
}
