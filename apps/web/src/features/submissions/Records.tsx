import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { INDIVIDUAL_RECORD_TYPES, NON_CORRECTABLE_RECORD_TYPES, ROLE_LABEL, type AppRole } from '@akreditasi/shared';
import { z } from 'zod';
import { api, errorMessage } from '../../api/client';
import type { FormalRecordView, RecordHistoryItem, User } from '../../api/types';
import { Badge, Button, Drawer, EmptyState, Field, FormError, Input, Modal, Spinner, Table, Td, Textarea } from '../../components/ui';
import { RECORD_LABEL, fmtDate, short } from '../common/labels';
import { useAction } from '../common/useAction';

export function canCorrect(r: FormalRecordView, user: User): boolean {
  if (NON_CORRECTABLE_RECORD_TYPES.includes(r.recordType)) return false;
  if (r.actorRole !== user.role) return false;
  if (INDIVIDUAL_RECORD_TYPES.includes(r.recordType)) return (r.actorUid ?? r.actorUserId) === user.id;
  return true;
}

export function RecordsTable({ submissionId, records, user }: { submissionId: string; records: FormalRecordView[]; user: User }) {
  const [hist, setHist] = useState<FormalRecordView | null>(null);
  const [corr, setCorr] = useState<FormalRecordView | null>(null);
  if (!records.length) return <EmptyState title="Belum ada catatan formal on-chain" />;
  return (
    <>
      <Table caption="Catatan formal on-chain" head={['Jenis', 'Versi', 'txId', 'Blok', 'Peran pencatat', 'Waktu', '']}>
        {records.map((r) => (
          <tr key={r.id}>
            <Td><div className="font-medium">{RECORD_LABEL[r.recordType] ?? r.recordType}</div>
              {r.status === 'pending_chain' && <Badge tone="warn">Menunggu konfirmasi</Badge>}</Td>
            <Td>v{r.version}</Td>
            <Td><code title={r.txId ?? ''} className="text-xs">{short(r.txId)}</code></Td>
            <Td>{r.blockNumber ?? '—'}</Td>
            <Td>{ROLE_LABEL[r.actorRole as AppRole] ?? r.actorRole ?? '—'}</Td>
            <Td>{fmtDate(r.committedAt ?? r.timestamp ?? r.createdAt)}</Td>
            <Td>
              <div className="flex gap-1">
                <Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => setHist(r)}>Riwayat</Button>
                {canCorrect(r, user) && <Button variant="secondary" className="!min-h-[32px] !px-2" onClick={() => setCorr(r)}>Koreksi</Button>}
              </div>
            </Td>
          </tr>
        ))}
      </Table>
      <HistoryDrawer record={hist} onClose={() => setHist(null)} />
      {corr && <CorrectionModal record={corr} submissionId={submissionId} onClose={() => setCorr(null)} />}
    </>
  );
}

function HistoryDrawer({ record, onClose }: { record: FormalRecordView | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['history', record?.id],
    enabled: !!record,
    queryFn: async () => (await api.get<RecordHistoryItem[]>(`/formal-records/${record!.id}/history`)).data ?? [],
  });
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => (a.value?.version ?? 0) - (b.value?.version ?? 0)), [q.data]);
  return (
    <Drawer open={!!record} onClose={onClose} title={`Riwayat versi — ${record ? RECORD_LABEL[record.recordType] ?? record.recordType : ''}`}>
      {q.isLoading && <Spinner />}
      {q.isError && <FormError message={errorMessage(q.error)} />}
      <ol className="space-y-4">
        {rows.map((h, i) => {
          const prev = i > 0 ? rows[i - 1]?.value?.payload : undefined;
          const cur = h.value?.payload ?? {};
          const changed = prev ? Object.keys({ ...prev, ...cur }).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(cur[k])) : [];
          return (
            <li key={h.txId} className="rounded-md border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={h.value?.version === 1 ? 'info' : 'accent'}>Versi {h.value?.version ?? '?'}</Badge>
                <span className="text-xs text-slate-500">{fmtDate(h.timestamp)}</span>
              </div>
              <p className="mt-1 text-xs">txId: <code title={h.txId}>{short(h.txId, 12, 6)}</code>{h.value?.lastWriter?.role && <> · penulis: {ROLE_LABEL[h.value.lastWriter.role as AppRole] ?? h.value.lastWriter.role}</>}</p>
              {h.value?.correction && <p className="mt-1"><b>Alasan:</b> {h.value.correction.reason}<br /><b>Bukti:</b> {h.value.correction.evidenceRef}</p>}
              {changed.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {changed.map((k) => <li key={k}><b>{k}</b>: <span className="text-red-700 line-through">{JSON.stringify(prev?.[k])}</span> → <span className="text-emerald-800">{JSON.stringify(cur[k])}</span></li>)}
                </ul>
              )}
              <details className="mt-2"><summary className="cursor-pointer text-xs text-navy-700">Muatan lengkap</summary>
                <pre className="mt-1 max-h-60 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(cur, null, 2)}</pre></details>
            </li>
          );
        })}
      </ol>
    </Drawer>
  );
}

const LOCKED = new Set(['submissionId', 'phase', 'offerSeq', 'responderRole']);
const metaSchema = z.object({
  reason: z.string().trim().min(5, 'Alasan koreksi wajib diisi (min. 5 karakter)'),
  evidenceRef: z.string().trim().min(3, 'Rujukan bukti wajib diisi'),
  expectedVersion: z.number().int().min(1),
});

/** Form koreksi dengan kolom sesuai tipe nilai JSON (string, angka, boolean, objek/larik sebagai JSON). */
function CorrectionModal({ record, submissionId, onClose }: { record: FormalRecordView; submissionId: string; onClose: () => void }) {
  const [vals, setVals] = useState<Record<string, string | boolean>>(() => {
    const o: Record<string, string | boolean> = {};
    for (const [k, v] of Object.entries(record.payload ?? {})) o[k] = typeof v === 'boolean' ? v : v !== null && typeof v === 'object' ? JSON.stringify(v, null, 2) : v === null ? '' : String(v);
    return o;
  });
  const [reason, setReason] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [expectedVersion, setExpectedVersion] = useState(record.version);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);

  const mut = useAction(
    (body: unknown) => api.post(`/formal-records/${record.id}/corrections`, body),
    { title: 'Koreksi catatan formal dikirim', submissionId, onDone: onClose },
  );

  const submit = () => {
    const e: Record<string, string> = {};
    const payload: Record<string, unknown> = {};
    for (const [k, orig] of Object.entries(record.payload ?? {})) {
      const raw = vals[k];
      if (typeof orig === 'boolean') payload[k] = Boolean(raw);
      else if (typeof orig === 'number') { const n = Number(raw); if (raw === '' || Number.isNaN(n)) e[k] = 'Harus berupa angka'; else payload[k] = n; }
      else if (orig !== null && typeof orig === 'object') { try { payload[k] = JSON.parse(String(raw)); } catch { e[k] = 'JSON tidak valid'; } }
      else if (orig === null) payload[k] = String(raw) === '' ? null : String(raw);
      else payload[k] = String(raw);
    }
    const m = metaSchema.safeParse({ reason, evidenceRef, expectedVersion });
    if (!m.success) for (const i of m.error.issues) e[String(i.path[0])] = i.message;
    setErrs(e);
    if (Object.keys(e).length) { setFormErr('Periksa kembali isian yang ditandai.'); return; }
    setFormErr(null);
    mut.mutate({ payload, reason: reason.trim(), evidenceRef: evidenceRef.trim(), expectedVersion });
  };

  return (
    <Modal open onClose={onClose} wide title={`Koreksi ${RECORD_LABEL[record.recordType] ?? record.recordType} (versi ${record.version})`}>
      <div className="space-y-3">
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200">Koreksi menulis versi baru pada catatan yang sama; versi sebelumnya tetap tersimpan di riwayat ledger.</p>
        <FormError message={formErr} />
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold text-navy-900">Muatan catatan</legend>
          {Object.entries(record.payload ?? {}).map(([k, orig]) => {
            const complex = orig !== null && typeof orig === 'object';
            return (
              <div key={k} className={complex ? 'sm:col-span-2' : ''}>
                <Field label={k} error={errs[k]}>
                  {(id) => typeof orig === 'boolean'
                    ? <input id={id} type="checkbox" checked={Boolean(vals[k])} onChange={(e) => setVals({ ...vals, [k]: e.target.checked })} className="h-5 w-5" />
                    : complex
                      ? <Textarea id={id} rows={5} className="font-mono text-xs" value={String(vals[k])} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
                      : <Input id={id} type={typeof orig === 'number' ? 'number' : 'text'} step="any" disabled={LOCKED.has(k)} value={String(vals[k])} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />}
                </Field>
              </div>
            );
          })}
        </fieldset>
        <Field label="Alasan koreksi" error={errs.reason}>{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <Field label="Rujukan bukti" error={errs.evidenceRef} hint="Mis. nomor surat, tautan, atau hash dokumen pendukung.">{(id) => <Input id={id} value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} />}</Field>
        <Field label="Versi yang diharapkan (expectedVersion)" error={errs.expectedVersion}>{(id) => <Input id={id} type="number" min={1} value={expectedVersion} onChange={(e) => setExpectedVersion(Number(e.target.value))} />}</Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={submit} loading={mut.isPending}>Kirim koreksi</Button>
        </div>
      </div>
    </Modal>
  );
}
