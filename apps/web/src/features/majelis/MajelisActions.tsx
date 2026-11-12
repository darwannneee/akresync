import { useForm } from 'react-hook-form';
import { MAX_TOTAL_SCORE } from '@akreditasi/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ACCREDITATION_RANKS } from '@akreditasi/shared';
import { api } from '../../api/client';
import { Button, DL, Field, Input, StepSection } from '../../components/ui';
import { RadioCards, useConfirmed } from '../common/forms';
import { useAction } from '../common/useAction';
import { RANK_LABEL, fmtDate, fmtNumber } from '../../lib/labels';
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
  const confirm = useConfirmed<V>({
    run: (v) => m.mutate(v), pending: m.isPending, title: 'Tetapkan peringkat akreditasi?', confirmLabel: 'Ya, tetapkan peringkat',
    summary: (v) => [['Program studi', s.programName], ['Institusi', s.institutionName], ['Peringkat', RANK_LABEL[v.rank]], ['Nomor Surat Keputusan', v.decreeNumber], ['Masa berlaku', v.rank === 'TIDAK_TERAKREDITASI' ? 'Tidak ada' : `${fmtDate(v.validFrom)} s.d. ${fmtDate(v.validUntil)}`]],
  });
  return (
    <form className="space-y-6" noValidate onSubmit={f.handleSubmit((v) => confirm.ask(v))}>
      {results.length > 0 && (
        <StepSection n={1} title="Tinjau hasil penilaian" hint={`Skor total pada skala 0 sampai ${fmtNumber(MAX_TOTAL_SCORE)}.`}>
          <DL cols={3} items={results.map((a) => [`${a.phase === 'AK' ? 'Kecukupan' : 'Lapangan'} · ${a.assessorName ?? 'Asesor'}`, fmtNumber(a.totalScore)] as [string, string])} />
        </StepSection>
      )}
      <StepSection n={results.length ? 2 : 1} title="Tetapkan peringkat">
        <RadioCards name="rank" legend="Peringkat akreditasi" value={rank} onChange={(v) => f.setValue('rank', v as V['rank'], { shouldValidate: true })} options={ACCREDITATION_RANKS.map((r) => ({ value: r, label: RANK_LABEL[r] }))} />
      </StepSection>
      <StepSection n={results.length ? 3 : 2} title="Isi Surat Keputusan dan masa berlaku">
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" label="Nomor Surat Keputusan" required error={e.decreeNumber?.message}>{(p) => <Input {...p} {...f.register('decreeNumber')} />}</Field>
          <Field label="Berlaku sejak" required={rank !== 'TIDAK_TERAKREDITASI'} error={e.validFrom?.message}>{(p) => <Input {...p} type="date" disabled={rank === 'TIDAK_TERAKREDITASI'} {...f.register('validFrom')} />}</Field>
          <Field label="Berlaku sampai" required={rank !== 'TIDAK_TERAKREDITASI'} error={e.validUntil?.message}>{(p) => <Input {...p} type="date" disabled={rank === 'TIDAK_TERAKREDITASI'} {...f.register('validUntil')} />}</Field>
        </div>
      </StepSection>
      <Button type="submit" loading={m.isPending}>Tetapkan peringkat akreditasi</Button>
      {confirm.dialog}
    </form>
  );
}
