import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ACCREDITATION_RANKS } from '@akreditasi/shared';
import { api } from '../../api/client';
import { Button, Card, Field, Input, Select } from '../../components/ui';
import { useAction } from '../common/useAction';
import type { ActionProps } from '../submissions/types';
import { DecisionView } from '../upps/UppsActions';

const RANK_LABEL: Record<(typeof ACCREDITATION_RANKS)[number], string> = { UNGGUL: 'Unggul', BAIK_SEKALI: 'Baik Sekali', BAIK: 'Baik', TIDAK_TERAKREDITASI: 'Tidak Terakreditasi' };
const schema = z.object({
  rank: z.enum(ACCREDITATION_RANKS),
  decreeNumber: z.string().trim().min(3, 'Nomor SK wajib diisi'),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.rank === 'TIDAK_TERAKREDITASI') return;
  if (!v.validFrom) ctx.addIssue({ code: 'custom', path: ['validFrom'], message: 'Tanggal mulai berlaku wajib diisi' });
  if (!v.validUntil) ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'Tanggal berakhir wajib diisi' });
  if (v.validFrom && v.validUntil && v.validUntil <= v.validFrom) ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'Harus setelah tanggal mulai' });
});

export function MajelisActions({ s, user }: ActionProps) {
  const f = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { rank: 'BAIK' } });
  const m = useAction((v: z.infer<typeof schema>) => api.post(`/submissions/${s.id}/decision`, {
    rank: v.rank, decreeNumber: v.decreeNumber,
    validFrom: v.rank === 'TIDAK_TERAKREDITASI' ? null : v.validFrom, validUntil: v.rank === 'TIDAK_TERAKREDITASI' ? null : v.validUntil,
  }), { title: 'Keputusan akreditasi ditetapkan', submissionId: s.id });
  const rank = f.watch('rank');
  const e = f.formState.errors;
  if (s.stage === 'decided' || s.stage === 'released') return <DecisionView s={s} user={user} />;
  if (s.stage !== 'final_verified') return null;
  return (
    <Card title="Penetapan keputusan akreditasi">
      <p className="mb-3 text-sm text-slate-600">Keputusan bersifat final di ledger; perubahan hanya melalui koreksi bercatatan alasan.</p>
      <form className="grid max-w-xl gap-3 sm:grid-cols-2" noValidate onSubmit={f.handleSubmit((v) => m.mutate(v))}>
        <Field label="Peringkat">{(id) => <Select id={id} {...f.register('rank')}>{ACCREDITATION_RANKS.map((r) => <option key={r} value={r}>{RANK_LABEL[r]}</option>)}</Select>}</Field>
        <Field label="Nomor SK" error={e.decreeNumber?.message}>{(id) => <Input id={id} {...f.register('decreeNumber')} />}</Field>
        <Field label="Berlaku sejak" error={e.validFrom?.message}>{(id) => <Input id={id} type="date" disabled={rank === 'TIDAK_TERAKREDITASI'} {...f.register('validFrom')} />}</Field>
        <Field label="Berlaku sampai" error={e.validUntil?.message}>{(id) => <Input id={id} type="date" disabled={rank === 'TIDAK_TERAKREDITASI'} {...f.register('validUntil')} />}</Field>
        <div className="sm:col-span-2"><Button type="submit" loading={m.isPending}>Tetapkan keputusan</Button></div>
      </form>
    </Card>
  );
}
