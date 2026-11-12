import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../api/client';
import { Badge, Button, Card, DL, Field, Select, Textarea } from '../../components/ui';
import { SingleUpload } from '../common/forms';
import { useAction, useDownload } from '../common/useAction';
import { fmtRupiah, RECORD_LABEL } from '../common/labels';
import type { ActionProps } from '../submissions/types';

const DOC_OPTS = [{ value: 'LED', label: 'LED — Laporan Evaluasi Diri' }, { value: 'LKPS', label: 'LKPS — Laporan Kinerja Program Studi' }, { value: 'SUPPORT', label: 'Dokumen pendukung' }];

export function UppsActions({ s }: ActionProps) {
  const id = s.id;
  const docs = s.documents ?? [];
  const current = docs.filter((d) => d.setVersion === s.documentSetVersion);
  const hasMain = ['LED', 'LKPS'].every((t) => current.some((d) => d.docType === t));
  const upload = useAction((v: { file: File; docType?: string }) => {
    const f = new FormData(); f.append('file', v.file); f.append('docType', v.docType ?? 'SUPPORT');
    return api.upload(`/submissions/${id}/documents`, f);
  }, { title: 'Dokumen diunggah', submissionId: id });
  const submit = useAction(() => api.post(`/submissions/${id}/submit`), { title: s.stage === 'admin_revision' ? 'Revisi dikirim' : 'Pengajuan resmi dikirim', submissionId: id });
  const proof = useAction((v: { file: File }) => { const f = new FormData(); f.append('file', v.file); return api.upload(`/submissions/${id}/payment-proof`, f); }, { title: 'Bukti pembayaran diunggah', submissionId: id });

  const blocks: JSX.Element[] = [];

  if (s.stage === 'draft' || s.stage === 'admin_revision') {
    const rev = s.stage === 'admin_revision';
    blocks.push(
      <Card key="up" title={rev ? 'Unggah revisi dokumen' : 'Unggah dokumen pengajuan'}>
        {rev && <p className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-900 ring-1 ring-amber-200">Sekretariat meminta revisi. Unggah ulang dokumen yang diperbaiki (LED dan LKPS wajib ada pada set versi baru), lalu kirim ulang.</p>}
        <SingleUpload label="Berkas" submitLabel="Unggah" docTypes={DOC_OPTS} pending={upload.isPending} onSubmit={(file, docType) => upload.mutate({ file, docType })} />
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 text-sm text-slate-600">{hasMain ? 'LED dan LKPS sudah lengkap pada set dokumen versi ini.' : 'LED dan LKPS wajib diunggah sebelum pengajuan dikirim.'}</p>
          <Button disabled={!hasMain} loading={submit.isPending} onClick={() => submit.mutate(undefined)}>{rev ? 'Kirim revisi' : 'Kirim pengajuan resmi'}</Button>
        </div>
      </Card>,
    );
  }

  const pay = s.payments?.[0];
  if (s.stage === 'invoice_issued' || (pay?.status === 'rejected')) {
    blocks.push(
      <Card key="pay" title="Tagihan & bukti pembayaran">
        {pay && <DL items={[['Nomor tagihan', pay.invoiceNo], ['Jumlah', fmtRupiah(pay.amount)], ['Status', pay.status], ['Catatan', pay.notes]]} />}
        <div className="mt-4"><SingleUpload label="Bukti pembayaran" submitLabel="Unggah bukti bayar" pending={proof.isPending} onSubmit={(file) => proof.mutate({ file })} /></div>
      </Card>,
    );
  } else if (pay) {
    blocks.push(<Card key="pay" title="Tagihan"><DL items={[['Nomor tagihan', pay.invoiceNo], ['Jumlah', fmtRupiah(pay.amount)], ['Status', <Badge key="b" tone={pay.status === 'verified' ? 'success' : 'info'}>{pay.status}</Badge>], ['Catatan', pay.notes]]} /></Card>);
  }

  blocks.push(<UppsOfferResponse key="offer" s={s} />, <UppsResponse key="resp" s={s} />);

  if (s.stage === 'decided' || s.stage === 'released') blocks.push(<DecisionView key="dec" s={s} />);
  return <>{blocks}</>;
}

const respSchema = z.object({ response: z.enum(['ACCEPT', 'REJECT']), reason: z.string().trim() })
  .refine((v) => v.response === 'ACCEPT' || v.reason.length >= 5, { path: ['reason'], message: 'Alasan penolakan wajib diisi' });

export function OfferResponseForm({ offerId, submissionId, title }: { offerId: string; submissionId: string; title: string }) {
  const f = useForm<z.infer<typeof respSchema>>({ resolver: zodResolver(respSchema), defaultValues: { response: 'ACCEPT', reason: '' } });
  const m = useAction((v: z.infer<typeof respSchema>) => api.post(`/offers/${offerId}/responses`, v), { title, submissionId });
  return (
    <form className="space-y-3" noValidate onSubmit={f.handleSubmit((v) => m.mutate(v))}>
      <Field label="Tanggapan Anda">{(id) => <Select id={id} {...f.register('response')}><option value="ACCEPT">Terima penugasan</option><option value="REJECT">Tolak penugasan</option></Select>}</Field>
      <Field label="Alasan (wajib bila menolak)" error={f.formState.errors.reason?.message}>{(id) => <Textarea id={id} {...f.register('reason')} />}</Field>
      <Button type="submit" loading={m.isPending}>Kirim tanggapan</Button>
    </form>
  );
}

function UppsOfferResponse({ s }: { s: ActionProps['s'] }) {
  const offer = [...(s.offers ?? [])].reverse().find((o) => o.status === 'offered');
  if (!offer || offer.uppsResponse) return null;
  return (
    <Card title="Penawaran asesor — tanggapan UPPS">
      <p className="mb-3 text-sm text-slate-600">KEA mengusulkan pasangan asesor{offer.assessor1Name ? `: ${offer.assessor1Name} dan ${offer.assessor2Name}` : ''}. Penugasan berlaku bila kedua asesor dan UPPS menerima.</p>
      <OfferResponseForm offerId={offer.id} submissionId={s.id} title="Tanggapan penawaran dikirim" />
    </Card>
  );
}

function UppsResponse({ s }: { s: ActionProps['s'] }) {
  const al = (s.assessments ?? []).filter((a) => a.phase === 'AL');
  const mine = (s.responses ?? []);
  const m = useAction((v: { type: 'accept' | 'objection'; body: string }) => api.post(`/submissions/${s.id}/responses`, v), { title: 'Tanggapan UPPS dikirim', submissionId: s.id });
  const [type, setType] = useState<'accept' | 'objection'>('accept');
  const show = s.stage === 'al_submitted' || mine.length > 0;
  if (!show) return null;
  return (
    <>
      <Card title="Hasil asesmen lapangan (AL)">
        {al.length ? <DL items={al.map((a) => [a.assessorName ?? 'Ketua asesor', `Skor ${a.totalScore ?? '—'} · ${a.status}`] as [string, string])} /> : <p className="text-sm text-slate-500">Rekap AL ditampilkan setelah ketua asesor menyampaikan hasil. Lihat pula “Catatan formal on-chain” di bawah.</p>}
        {mine.length > 0 && <ul className="mt-3 space-y-2 text-sm">{mine.map((r) => <li key={r.id} className="rounded bg-slate-50 p-2"><b>{r.responderRole === 'upps' ? 'UPPS' : 'Ketua asesor'} ({r.responseType}):</b> {r.body}</li>)}</ul>}
      </Card>
      {s.stage === 'al_submitted' && !mine.some((r) => r.responderRole === 'upps' && r.responseType === 'accept') && (
        <Card title="Tanggapan UPPS atas hasil AL">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const body = (new FormData(e.currentTarget).get('body') as string).trim(); if (type === 'objection' && body.length < 5) return; m.mutate({ type, body: body || 'Menerima hasil asesmen.' }); }}>
            <Field label="Jenis tanggapan">{(id) => <Select id={id} value={type} onChange={(e) => setType(e.target.value as 'accept' | 'objection')}><option value="accept">Menerima hasil</option><option value="objection">Mengajukan keberatan</option></Select>}</Field>
            <Field label={type === 'objection' ? 'Uraian keberatan (wajib)' : 'Catatan (opsional)'}>{(id) => <Textarea id={id} name="body" required={type === 'objection'} minLength={type === 'objection' ? 5 : undefined} />}</Field>
            <Button type="submit" loading={m.isPending}>Kirim tanggapan</Button>
          </form>
        </Card>
      )}
    </>
  );
}

export function DecisionView({ s }: { s: ActionProps['s']; user?: unknown }) {
  const download = useDownload();
  const dec = s.records?.find((r) => r.recordType === 'DECISION');
  const p = dec?.payload as { rank?: string; decreeNumber?: string; validFrom?: string | null; validUntil?: string | null; totalScore?: number } | undefined;
  return (
    <Card title="Keputusan akreditasi">
      {p ? <DL items={[['Peringkat', <b key="r">{p.rank?.replace('_', ' ')}</b>], ['Nomor SK', p.decreeNumber], ['Skor total', p.totalScore], ['Berlaku', p.validFrom ? `${p.validFrom} s.d. ${p.validUntil}` : '—']]} /> : <p className="text-sm text-slate-500">{RECORD_LABEL.DECISION} belum tersedia.</p>}
      <div className="mt-3">
        {s.certificate
          ? <Button variant="accent" onClick={() => download(`/certificates/${s.certificate!.id}/download`, `sertifikat-${s.certificate!.certificateNo}.pdf`)}>Unduh sertifikat ({s.certificate.certificateNo})</Button>
          : <p className="text-sm text-slate-500">Sertifikat belum diterbitkan oleh Sekretariat Administrasi.</p>}
      </div>
    </Card>
  );
}

