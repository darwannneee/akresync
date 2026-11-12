import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Field, PageHeader, Select } from '../components/ui';
import { usePrograms } from '../features/common/queries';
import { useAction } from '../features/common/useAction';

export function NewDraftPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const progs = usePrograms(user?.institutionId ?? '');
  const [programId, setProgramId] = useState('');
  const m = useAction((v: { programId: string }) => api.post<{ id: string }>('/submissions', v), { title: 'Draf pengajuan dibuat', onDone: (e) => nav(`/pengajuan/${e.data.id}`) });
  return (
    <div className="max-w-xl">
      <PageHeader title="Pengajuan Baru" subtitle={user?.institutionName ?? undefined} />
      <Card>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (programId) m.mutate({ programId }); }}>
          <Field label="Program studi">{(id) => (
            <Select id={id} value={programId} onChange={(e) => setProgramId(e.target.value)} required>
              <option value="">{progs.isLoading ? 'Memuat…' : 'Pilih program studi'}</option>
              {progs.data?.map((p) => <option key={p.id} value={p.id}>{p.level} — {p.name}</option>)}
            </Select>)}
          </Field>
          <p className="text-xs text-slate-500">Draf dapat dilengkapi dengan dokumen LED, LKPS, dan pendukung sebelum dikirim secara resmi.</p>
          <Button type="submit" disabled={!programId} loading={m.isPending}>Buat draf</Button>
        </form>
      </Card>
    </div>
  );
}
