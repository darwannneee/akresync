import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ACCREDITATION_RANKS } from '@akreditasi/shared';
import { api } from '../../api/client';
import { Button, Field, Input, ModalActions } from '../../components/ui';
import { FormSection, KeyList, RadioCards, useConfirmed } from '../common/forms';
import { useAction } from '../common/useAction';
import { RANK_LABEL, fmtDate, fmtNumber, fmtScore, scoreFromTotal } from '../../lib/labels';
import type { ActionProps } from '../submissions/types';

const schema = z.object({
  rank: z.enum(ACCREDITATION_RANKS),
  decreeNumber: z.string().trim().min(3, 'Nomor Surat Keputusan wajib diisi. Contoh: 123/SK/LAM/2026'),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.rank === 'TIDAK_TERAKREDITASI') return;
  if (!v.validFrom) ctx.addIssue({ code: 'custom', path: ['validFrom'], message: 'Tanggal mulai berlaku wajib diisi' });
  if (!v.validUntil) ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'Tanggal berakhir wajib diisi' });
  if (v.validFrom && v.validUntil && v.validUntil <= v.validFrom) ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'Tanggal berakhir harus setelah tanggal mulai' });
});
type V = z.infer<typeof schema>;

export function DecisionForm({ s }: ActionProps) {
  const f = useForm<V>({ resolver: zodResolver(schema), defaultValues: { rank: 'BAIK' } });
  const m = useAction((v: V) => api.post(`/submissions/${s.id}/decision`, {
    rank: v.rank, decreeNumber: v.decreeNumber,
    validFrom: v.rank === 'TIDAK_TERAKREDITASI' ? null : v.validFrom, validUntil: v.rank === 'TIDAK_TERAKREDITASI' ? null : v.validUntil,
  }), { title: 'Peringkat akreditasi telah ditetapkan', submissionId: s.id });
  const rank = f.watch('rank');
  const e = f.formState.errors;
  const results = (s.assessments ?? []).filter((a) => a.status === 'submitted');
  const fid = useId();
  const confirm = useConfirmed<V>({
    run: (v) => m.mutate(v), pending: m.isPending, title: 'Tetapkan peringkat akreditasi?', confirmLabel: 'Ya, tetapkan peringkat',
    summary: (v) => [['Program studi', s.programName], ['Institusi', s.institutionName], ['Peringkat', RANK_LABEL[v.rank]], ['Nomor Surat Keputusan', v.decreeNumber], ['Masa berlaku', v.rank === 'TIDAK_TERAKREDITASI' ? 'Tidak ada' : `${fmtDate(v.validFrom)} s.d. ${fmtDate(v.validUntil)}`]],
  });
  return (
    <form id={fid} className="space-y-6" noValidate onSubmit={f.handleSubmit((v) => confirm.ask(v))}>
      {s.finalVerification?.notes && (
        <FormSection title="Catatan verifikasi akhir KEA">
          <p className="whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-[14.5px] text-ink">{s.finalVerification.notes}</p>
        </FormSection>
      )}
      {results.length > 0 && (
        <FormSection title="Hasil penilaian" hint="Rata-rata berbobot pada skala 0 sampai 4; skor total berbobot dalam kurung.">
          <KeyList items={results.map((a) => [`${a.phase === 'AK' ? 'Asesmen Kecukupan' : 'Asesmen Lapangan'} · ${a.assessorName ?? 'Asesor'}`, <span key={a.id} className="tabular-nums"><b className="font-semibold">{fmtScore(scoreFromTotal(a.totalScore))}</b> <span className="text-faint">/ 4,00 ({fmtNumber(a.totalScore)})</span></span>] as [string, React.ReactNode])} />
        </FormSection>
      )}
      <RadioCards name="rank" legend="Peringkat akreditasi" value={rank} onChange={(v) => f.setValue('rank', v as V['rank'], { shouldValidate: true })} options={ACCREDITATION_RANKS.map((r) => ({ value: r, label: RANK_LABEL[r] }))} />
      <FormSection title="Surat Keputusan dan masa berlaku" hint={rank === 'TIDAK_TERAKREDITASI' ? 'Masa berlaku tidak diisi untuk peringkat Tidak Terakreditasi.' : undefined}>
        <div className="space-y-4">
          <Field label="Nomor Surat Keputusan" required error={e.decreeNumber?.message}>{(p) => <Input {...p} placeholder="Contoh: 123/SK/LAM/2026" {...f.register('decreeNumber')} />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Berlaku sejak" required={rank !== 'TIDAK_TERAKREDITASI'} error={e.validFrom?.message}>{(p) => <Input {...p} type="date" disabled={rank === 'TIDAK_TERAKREDITASI'} {...f.register('validFrom')} />}</Field>
            <Field label="Berlaku sampai" required={rank !== 'TIDAK_TERAKREDITASI'} error={e.validUntil?.message}>{(p) => <Input {...p} type="date" disabled={rank === 'TIDAK_TERAKREDITASI'} {...f.register('validUntil')} />}</Field>
          </div>
        </div>
      </FormSection>
      <ModalActions><Button type="submit" form={fid} loading={m.isPending}>Simpan keputusan</Button></ModalActions>
      {confirm.dialog}
    </form>
  );
}
