import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Field, HorizontalForm, Notice, PageHeader, Select, StepIndicator } from '../components/ui';
import { usePrograms } from '../features/common/queries';
import { useAction } from '../features/common/useAction';

export function NewDraftPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const progs = usePrograms(user?.institutionId ?? '');
  const [programId, setProgramId] = useState('');
  const m = useAction((v: { programId: string }) => api.post<{ id: string }>('/submissions', v), { title: 'Draf pengajuan telah dibuat', onDone: (e) => nav(`/pengajuan/${e.data.id}`) });
  return (
    <div>
      <PageHeader title="Ajukan Akreditasi Baru" crumbs={[{ label: 'Pengajuan' }, { label: 'Pengajuan Baru' }]} />
      <div className="mx-auto max-w-3xl">
        <Card title={`Pilih Program Studi${user?.institutionName ? ` — ${user.institutionName}` : ''}`}>
          <StepIndicator className="mb-6" steps={[{ label: 'Pilih program studi', state: 'current' }, { label: 'Unggah LED dan LKPS', state: 'todo' }, { label: 'Kirim pengajuan resmi', state: 'todo' }]} />
          <HorizontalForm>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (programId) m.mutate({ programId }); }}>
              <Field label="Program studi" required hint="Hanya program studi pada institusi Bapak/Ibu yang ditampilkan.">
                {(p) => (
                  <Select {...p} value={programId} onChange={(e) => setProgramId(e.target.value)} required>
                    <option value="">{progs.isLoading ? 'Memuat daftar program studi…' : 'Pilih program studi'}</option>
                    {progs.data?.map((x) => <option key={x.id} value={x.id}>{x.level} — {x.name}</option>)}
                  </Select>
                )}
              </Field>
              <Notice tone="info">Membuat draf belum mengirim pengajuan. Draf dapat dilengkapi kapan saja sebelum dikirim secara resmi.</Notice>
              <div className="flex justify-end border-t border-line pt-4"><Button type="submit" disabled={!programId} loading={m.isPending}>Buat Draf Pengajuan</Button></div>
            </form>
          </HorizontalForm>
        </Card>
      </div>
    </div>
  );
}
