import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { SubmissionStage } from '@akreditasi/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Field, HorizontalForm, Notice, PageHeader, Select, StepIndicator } from '../components/ui';
import { usePrograms } from '../features/common/queries';
import { useAction } from '../features/common/useAction';
import { STAGE_LABEL } from '../lib/labels';

export function NewDraftPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const progs = usePrograms(user?.institutionId ?? '');
  const [programId, setProgramId] = useState('');
  const m = useAction((v: { programId: string }) => api.post<{ id: string }>('/submissions', v), { title: 'Draf pengajuan telah dibuat', onDone: (e) => nav(`/upps/pengajuan/${e.data.id}/susun`) });
  const list = progs.data ?? [];
  const busy = list.filter((x) => x.activeSubmissionId);
  const allBusy = list.length > 0 && busy.length === list.length;
  return (
    <div>
      <PageHeader title="Ajukan akreditasi baru" crumbs={[{ label: 'Pengajuan' }, { label: 'Pengajuan baru' }]} />
      <div className="mx-auto max-w-3xl">
        <Card title="Pilih program studi" description={user?.institutionName ?? undefined}>
          <StepIndicator className="mb-6" steps={[{ label: 'Pilih program studi', state: 'current' }, { label: 'Unggah LED dan LKPS', state: 'todo' }, { label: 'Kirim pengajuan resmi', state: 'todo' }]} />
          <HorizontalForm>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (programId) m.mutate({ programId }); }}>
              <Field label="Program studi" required hint="Satu program studi hanya dapat memiliki satu pengajuan yang sedang berjalan.">
                {(p) => (
                  <Select {...p} value={programId} onChange={(e) => setProgramId(e.target.value)} required disabled={allBusy}>
                    <option value="">{progs.isLoading ? 'Memuat daftar program studi…' : 'Pilih program studi'}</option>
                    {list.map((x) => <option key={x.id} value={x.id} disabled={!!x.activeSubmissionId}>{x.level} — {x.name}{x.activeSubmissionId ? ' (pengajuan sedang berjalan)' : ''}</option>)}
                  </Select>
                )}
              </Field>
              {busy.length > 0 && (
                <Notice tone={allBusy ? 'warn' : 'info'} title={allBusy ? 'Semua program studi sudah memiliki pengajuan yang berjalan' : undefined}>
                  <ul className="space-y-1">
                    {busy.map((x) => (
                      <li key={x.id}>{x.level} — {x.name}: {STAGE_LABEL[x.activeStage as SubmissionStage] ?? 'sedang berjalan'}. <Link className="font-semibold text-navy-700 hover:underline" to={x.activeStage === 'draft' || x.activeStage === 'admin_revision' ? `/upps/pengajuan/${x.activeSubmissionId}/susun` : `/pengajuan/${x.activeSubmissionId}`}>Buka pengajuan</Link></li>
                    ))}
                  </ul>
                  <p className="mt-1.5">Pengajuan baru untuk program studi tersebut dapat dibuat setelah pengajuannya selesai.</p>
                </Notice>
              )}
              {!allBusy && <Notice tone="info">Membuat draf belum mengirim pengajuan. Setelah draf dibuat, Bapak/Ibu langsung diarahkan ke halaman penyusunan untuk mengunggah LED dan LKPS.</Notice>}
              <div className="flex justify-end border-t border-line pt-4"><Button type="submit" disabled={!programId || allBusy} loading={m.isPending}>Buat draf dan lanjutkan</Button></div>
            </form>
          </HorizontalForm>
        </Card>
      </div>
    </div>
  );
}
