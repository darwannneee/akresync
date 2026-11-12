import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, PencilLine } from 'lucide-react';
import { INDIVIDUAL_RECORD_TYPES, NON_CORRECTABLE_RECORD_TYPES } from '@akreditasi/shared';
import { z } from 'zod';
import { api, errorMessage } from '../../api/client';
import type { FormalRecordView, RecordHistoryItem, User } from '../../api/types';
import { Badge, Button, CopyableMono, DataTable, EmptyState, Field, FormError, Input, Modal, Notice, ProofBadge, Spinner, TechnicalDetails, Textarea } from '../../components/ui';
import { PAYLOAD_FIELD_LABEL, RANK_LABEL, RECORD_LABEL, RESULT_LABEL, fmtDateTime, roleName } from '../../lib/labels';
import { recordTime } from '../../lib/workflow';
import { useConfirmed } from '../common/forms';
import { useAction } from '../common/useAction';

export function canCorrect(r: FormalRecordView, user: User, records: FormalRecordView[] = [r]): boolean {
  if (records.some((o) => o.recordKey === r.recordKey && o.version > r.version)) return false;
  if (NON_CORRECTABLE_RECORD_TYPES.includes(r.recordType)) return false;
  if (r.actorRole !== user.role) return false;
  if (INDIVIDUAL_RECORD_TYPES.includes(r.recordType)) return (r.actorUid ?? r.actorUserId) === user.id;
  return true;
}

const fieldLabel = (k: string) => PAYLOAD_FIELD_LABEL[k] ?? k;
const fmtVal = (k: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'rank') return RANK_LABEL[v as keyof typeof RANK_LABEL] ?? String(v);
  if (k === 'result' || k === 'response') return RESULT_LABEL[String(v)] ?? String(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

export function RecordsTable({ submissionId, records, user }: { submissionId: string; records: FormalRecordView[]; user: User }) {
  const [hist, setHist] = useState<FormalRecordView | null>(null);
  const [corr, setCorr] = useState<FormalRecordView | null>(null);
  if (!records.length) return <EmptyState title="Belum ada catatan resmi" icon={<History size={22} />}>Catatan resmi muncul di sini setelah tahap formal pertama dikirim. Seluruh catatan bersifat permanen.</EmptyState>;
  return (
    <>
      <DataTable rows={records} rowKey={(r) => r.id} caption="Catatan resmi"
        columns={[
          { key: 'j', header: 'Catatan', primary: true, cell: (r) => <div><div className="font-medium text-ink">{RECORD_LABEL[r.recordType] ?? r.recordType}</div><div className="mt-1 flex flex-wrap gap-1"><Badge tone={r.version > 1 ? 'gold' : 'neutral'}>{r.version > 1 ? `Hasil koreksi (versi ${r.version})` : 'Versi asli'}</Badge></div></div> },
          { key: 'p', header: 'Dicatat oleh', cell: (r) => <div><div>{roleName(r.actorRole as string)}</div><div className="text-sm text-muted">{fmtDateTime(recordTime(r))}</div></div> },
          { key: 's', header: 'Bukti', cell: (r) => r.status === 'pending_chain' ? <ProofBadge status="pending" /> : r.status === 'failed' ? <ProofBadge status="failed" /> : <ProofBadge status="committed" /> },
          { key: 't', header: 'Rincian teknis', cell: (r) => <TechnicalDetails items={[['Nomor transaksi', <CopyableMono key="t" value={r.txId} full />], ['Blok', r.blockNumber], ['Kunci catatan', <CopyableMono key="k" value={r.recordKey} full />]]} /> },
          { key: 'a', header: '', cell: (r) => (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={<History size={15} />} onClick={() => setHist(r)}>Riwayat versi</Button>
              {canCorrect(r, user, records) && <Button variant="secondary" size="sm" icon={<PencilLine size={15} />} onClick={() => setCorr(r)}>Koreksi</Button>}
            </div>
          ) },
        ]} />
      <HistoryModal record={hist} onClose={() => setHist(null)} />
      {corr && <CorrectionModal record={corr} submissionId={submissionId} onClose={() => setCorr(null)} />}
    </>
  );
}

function HistoryModal({ record, onClose }: { record: FormalRecordView | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['history', record?.id], enabled: !!record, queryFn: async () => (await api.get<RecordHistoryItem[]>(`/formal-records/${record!.id}/history`)).data ?? [] });
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => (a.value?.version ?? 0) - (b.value?.version ?? 0)), [q.data]);
  return (
    <Modal open={!!record} onClose={onClose} wide footer={<Button onClick={onClose}>Tutup</Button>} title={`Riwayat versi: ${record ? RECORD_LABEL[record.recordType] ?? record.recordType : ''}`}>
      <p className="mb-4 text-sm text-muted">Setiap koreksi menambah versi baru. Versi sebelumnya tetap tersimpan dan tidak dapat dihapus.</p>
      {q.isLoading && <Spinner />}
      {q.isError && <FormError message={errorMessage(q.error)} />}
      <ol className="space-y-4">
        {rows.map((h, i) => {
          const prev = i > 0 ? rows[i - 1]?.value?.payload : undefined;
          const cur = h.value?.payload ?? {};
          const changed = prev ? Object.keys({ ...prev, ...cur }).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(cur[k])) : [];
          return (
            <li key={h.txId} className="rounded border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={h.value?.version === 1 ? 'info' : 'gold'}>{h.value?.version === 1 ? 'Versi asli' : `Versi ${h.value?.version ?? '?'}`}</Badge>
                <span className="text-sm text-muted">{fmtDateTime(h.timestamp)}</span>
              </div>
              {h.value?.lastWriter?.role && <p className="mt-2 text-sm">Dicatat oleh <b>{roleName(h.value.lastWriter.role)}</b></p>}
              {h.value?.correction && <div className="mt-2 text-sm"><p><b>Alasan koreksi:</b> {h.value.correction.reason}</p><p><b>Rujukan bukti:</b> {h.value.correction.evidenceRef}</p></div>}
              {changed.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                  {changed.map((k) => <li key={k}><b>{fieldLabel(k)}:</b> <span className="text-bad line-through">{fmtVal(k, prev?.[k])}</span> menjadi <span className="font-medium text-ok">{fmtVal(k, cur[k])}</span></li>)}
                </ul>
              )}
              <div className="mt-3"><TechnicalDetails items={[['Nomor transaksi', <CopyableMono key="t" value={h.txId} full />], ['Muatan lengkap', <pre key="p" className="max-h-60 overflow-auto rounded bg-white p-2 font-mono text-xs">{JSON.stringify(cur, null, 2)}</pre>]]} /></div>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}

const LOCKED = new Set(['submissionId', 'phase', 'offerSeq', 'responderRole']);
const metaSchema = z.object({
  reason: z.string().trim().min(5, 'Alasan koreksi wajib diisi (minimal 5 huruf)'),
  evidenceRef: z.string().trim().min(3, 'Rujukan bukti wajib diisi'),
  expectedVersion: z.number().int().min(1),
});

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

  const mut = useAction((body: unknown) => api.post(`/formal-records/${record.id}/corrections`, body), { title: 'Koreksi catatan telah dikirim', submissionId, onDone: onClose });
  const confirm = useConfirmed<{ payload: Record<string, unknown> }>({
    run: (v) => mut.mutate({ payload: v.payload, reason: reason.trim(), evidenceRef: evidenceRef.trim(), expectedVersion }), pending: mut.isPending,
    title: 'Kirim koreksi catatan resmi?', confirmLabel: 'Ya, kirim koreksi',
    summary: () => [['Catatan', RECORD_LABEL[record.recordType] ?? record.recordType], ['Menjadi versi', expectedVersion + 1], ['Alasan koreksi', reason], ['Rujukan bukti', evidenceRef]],
  });

  const submit = () => {
    const e: Record<string, string> = {};
    const payload: Record<string, unknown> = {};
    for (const [k, orig] of Object.entries(record.payload ?? {})) {
      const raw = vals[k];
      if (typeof orig === 'boolean') payload[k] = Boolean(raw);
      else if (typeof orig === 'number') { const n = Number(raw); if (raw === '' || Number.isNaN(n)) e[k] = 'Isi dengan angka'; else payload[k] = n; }
      else if (orig !== null && typeof orig === 'object') { try { payload[k] = JSON.parse(String(raw)); } catch { e[k] = 'Format isian tidak valid'; } }
      else if (orig === null) payload[k] = String(raw) === '' ? null : String(raw);
      else payload[k] = String(raw);
    }
    const m = metaSchema.safeParse({ reason, evidenceRef, expectedVersion });
    if (!m.success) for (const i of m.error.issues) e[String(i.path[0])] = i.message;
    setErrs(e);
    if (Object.keys(e).length) { setFormErr('Periksa kembali isian yang ditandai.'); return; }
    setFormErr(null);
    confirm.ask({ payload });
  };

  return (
    <Modal open onClose={onClose} wide title={`Koreksi: ${RECORD_LABEL[record.recordType] ?? record.recordType}`}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button onClick={submit} loading={mut.isPending}>Lanjut ke konfirmasi</Button></>}>
      <div className="space-y-5">
        <Notice tone="chain" title="Koreksi menambah versi baru">Catatan asli tetap tersimpan dan dapat dilihat pada Riwayat versi. Sebutkan alasan dan rujukan bukti yang dapat diperiksa.</Notice>
        <FormError message={formErr} />
        <fieldset className="space-y-3">
          <legend className="mb-2 text-[15px] font-medium">1. Ubah isi catatan</legend>
          {Object.entries(record.payload ?? {}).map(([k, orig]) => {
            const complex = orig !== null && typeof orig === 'object';
            return (
              <div key={k}>
                <Field label={fieldLabel(k)} error={errs[k]} hint={LOCKED.has(k) ? 'Tidak dapat diubah.' : undefined}>
                  {(p) => typeof orig === 'boolean'
                    ? <input {...p} type="checkbox" checked={Boolean(vals[k])} onChange={(e) => setVals({ ...vals, [k]: e.target.checked })} className="h-5 w-5" />
                    : complex
                      ? <Textarea {...p} rows={5} className="font-mono text-xs" value={String(vals[k])} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
                      : <Input {...p} type={typeof orig === 'number' ? 'number' : 'text'} step="any" disabled={LOCKED.has(k)} value={String(vals[k])} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />}
                </Field>
              </div>
            );
          })}
        </fieldset>
        <div className="space-y-4">
          <h3 className="text-[15px] font-medium">2. Alasan dan bukti</h3>
          <Field label="Alasan koreksi" required error={errs.reason}>{(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <Field label="Rujukan bukti" required error={errs.evidenceRef} hint="Misalnya nomor surat, tautan, atau nama dokumen pendukung.">{(p) => <Input {...p} value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} />}</Field>
          <Field label="Versi catatan yang dikoreksi" error={errs.expectedVersion} hint="Terisi otomatis. Ubah hanya bila diminta administrator.">{(p) => <Input {...p} type="number" min={1} value={expectedVersion} onChange={(e) => setExpectedVersion(Number(e.target.value))} />}</Field>
        </div>
      </div>
      {confirm.dialog}
    </Modal>
  );
}
