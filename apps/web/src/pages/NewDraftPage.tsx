import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Field, Notice, PageHeader, Select, StepIndicator } from '../components/ui';
import { usePrograms } from '../features/common/queries';
import { useAction } from '../features/common/useAction';

export function NewDraftPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const progs = usePrograms(user?.institutionId ?? '');
  const [programId, setProgramId] = useState('');
  const m = useAction((v: { programId: string }) => api.post<{ id: string }>('/submissions', v), { title: 'Draf pengajuan telah dibuat', onDone: (e) => nav(`/pengajuan/${e.data.id}`) });
  return (
    <div className="max-w-3xl">
      <PageHeader title="Ajukan akreditasi baru" subtitle={user?.institutionName ?? undefined} />
      <Card title="Langkah 1: pilih program studi" description="Setelah draf dibuat, Bapak/Ibu akan diarahkan ke halaman pengajuan untuk mengunggah dokumen.">
        <StepIndicator className="mb-6" steps={[{ label: 'Pilih program studi', state: 'current' }, { label: 'Unggah LED dan LKPS', state: 'todo' }, { label: 'Kirim pengajuan resmi', state: 'todo' }]} />
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (programId) m.mutate({ programId }); }}>
          <Field label="Program studi yang diajukan" required hint="Hanya program studi pada institusi Bapak/Ibu yang ditampilkan.">
            {(p) => (
              <Select {...p} value={programId} onChange={(e) => setProgramId(e.target.value)} required>
                <option value="">{progs.isLoading ? 'Memuat daftar program studi…' : 'Pilih program studi'}</option>
                {progs.data?.map((x) => <option key={x.id} value={x.id}>{x.level} — {x.name}</option>)}
              </Select>
            )}
          </Field>
          <Notice tone="info">Membuat draf belum mengirim pengajuan. Draf tersimpan dan dapat dilengkapi kapan saja sebelum dikirim secara resmi.</Notice>
          <Button type="submit" disabled={!programId} loading={m.isPending}>Buat draf pengajuan</Button>
        </form>
      </Card>
    </div>
  );
}
