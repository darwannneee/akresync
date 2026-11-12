import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Button, Card, FormError, Input, PageHeader, Spinner, Badge } from '../../components/ui';
import { useSubmission } from '../common/queries';
import { useAction } from '../common/useAction';
import { CRITERIA, MAX_ITEM, MAX_TOTAL, computeTotal, emptyScores, type Scores } from './criteria';

export function ScoringPage() {
  const { id = '', phase: ph = 'AK' } = useParams();
  const phase = ph === 'AL' ? 'AL' : 'AK';
  const { user } = useAuth();
  const q = useSubmission(id);
  const [scores, setScores] = useState<Scores>(emptyScores());
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const mine = q.data?.assessments?.find((a) => a.phase === phase && a.assessorId === user?.id);

  useEffect(() => {
    if (loaded || !q.data) return;
    const base = emptyScores();
    for (const [c, items] of Object.entries(mine?.scores ?? {})) for (const [k, v] of Object.entries(items)) if (base[c] && k in base[c]!) base[c]![k] = v;
    setScores(base); setLoaded(true);
  }, [q.data, mine, loaded]);

  const save = useAction(() => api.put(`/submissions/${id}/assessments/${phase}/draft`, { scores }), { title: 'Draf penilaian disimpan', submissionId: id, onDone: () => setDirty(false) });
  const submit = useAction(() => api.post(`/submissions/${id}/assessments/${phase}/submit`), { title: `Penilaian ${phase} dikirim`, submissionId: id });
  const [confirm, setConfirm] = useState(false);

  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <FormError message="Pengajuan tidak dapat dimuat." />;
  const locked = mine?.status === 'submitted';
  const { total, filled, count } = computeTotal(scores);
  const complete = filled === count;
  if (submit.isSuccess) return <Navigate to={`/pengajuan/${id}`} replace />;

  const set = (c: string, k: string, raw: string) => {
    const n = raw === '' ? '' : Math.min(MAX_ITEM, Math.max(0, Number(raw)));
    setScores((s) => ({ ...s, [c]: { ...s[c], [k]: Number.isNaN(n) ? '' : n } })); setDirty(true);
  };

  return (
    <div className="space-y-4">
      <PageHeader title={`Penilaian ${phase === 'AK' ? 'Asesmen Kecukupan (AK)' : 'Asesmen Lapangan (AL)'}`} subtitle={<Link className="text-navy-700 underline" to={`/pengajuan/${id}`}>← Kembali ke detail pengajuan</Link>} />
      <Card title="Ringkasan skor" actions={<Badge tone={locked ? 'success' : 'warn'}>{locked ? 'Telah dikirim' : 'Draf'}</Badge>}>
        <p className="text-sm">Terisi <b>{filled}</b> dari {count} butir · Total (skala 0–{MAX_TOTAL}): <b className="text-xl text-navy-900">{total}</b></p>
      </Card>
      {CRITERIA.map((c) => (
        <Card key={c.code} title={`${c.code} — ${c.name}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: c.items }, (_, i) => `b${i + 1}`).map((k, i) => (
              <label key={k} className="text-sm">
                <span className="label">Butir {c.code}.{i + 1}</span>
                <Input type="number" inputMode="decimal" min={0} max={MAX_ITEM} step={0.5} disabled={locked} value={scores[c.code]?.[k] ?? ''} onChange={(e) => set(c.code, k, e.target.value)} aria-label={`Butir ${c.code}.${i + 1} (0 sampai ${MAX_ITEM})`} />
              </label>
            ))}
          </div>
        </Card>
      ))}
      {!locked && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 p-3 sm:-mx-6">
          <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Simpan draf</Button>
          <Button disabled={!complete || dirty || !mine} loading={submit.isPending} onClick={() => setConfirm(true)}>Kirim penilaian</Button>
          <span className="text-xs text-slate-500">{!complete ? 'Lengkapi seluruh butir untuk mengirim.' : dirty ? 'Simpan draf terlebih dahulu.' : ''}</span>
        </div>
      )}
      {confirm && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-navy-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl bg-white p-4">
            <p className="font-semibold text-navy-900">Kirim penilaian {phase}?</p>
            <p className="mt-1 text-sm text-slate-600">Hasil dicatat on-chain dengan total skor {total}. Perubahan setelahnya hanya melalui koreksi.</p>
            <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(false)}>Batal</Button><Button loading={submit.isPending} onClick={() => { submit.mutate(undefined); setConfirm(false); }}>Ya, kirim</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
