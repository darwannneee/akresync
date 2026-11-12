import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../api/client';
import type { AuditEventView, AuditVerifyResult } from '../../api/types';
import { Badge, Button, EmptyState, Table, Td } from '../../components/ui';
import { AUDIT_KIND_LABEL, AuditBadge, fmtDate, short } from '../common/labels';
import { useToast } from '../../components/Toast';

export function AuditTable({ events }: { events: AuditEventView[] }) {
  const [res, setRes] = useState<Record<string, AuditVerifyResult | { error: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  if (!events.length) return <EmptyState title="Belum ada peristiwa audit" />;
  const verify = async (id: string) => {
    setBusy(id);
    try {
      const r = (await api.get<AuditVerifyResult>(`/audit/${id}/verify`)).data;
      setRes((x) => ({ ...x, [id]: r }));
    } catch (e) {
      setRes((x) => ({ ...x, [id]: { error: errorMessage(e) } }));
      toast.error(errorMessage(e));
    } finally { setBusy(null); }
  };
  return (
    <Table caption="Peristiwa audit" head={['Peristiwa', 'Versi', 'Status', 'txId', 'Waktu', 'Verifikasi']}>
      {events.map((e) => {
        const r = res[e.eventId];
        return (
          <tr key={e.eventId}>
            <Td><div className="font-medium">{AUDIT_KIND_LABEL[e.kind] ?? e.kind}</div><div className="text-xs text-slate-500">{e.actorRole}</div></Td>
            <Td>{e.version ?? '—'}</Td>
            <Td><AuditBadge status={e.status} />{e.status === 'failed' && e.lastError && <div className="mt-1 max-w-[16rem] text-xs text-red-700">{e.lastError}</div>}</Td>
            <Td><code className="text-xs" title={e.txId ?? ''}>{short(e.txId)}</code></Td>
            <Td>{fmtDate(e.occurredAt)}</Td>
            <Td>
              <Button variant="secondary" className="!min-h-[32px] !px-2" loading={busy === e.eventId} disabled={e.status !== 'committed'} title={e.status !== 'committed' ? 'Hanya untuk peristiwa yang sudah tercatat on-chain' : undefined} onClick={() => void verify(e.eventId)}>Verifikasi</Button>
              {r && ('error' in r ? <p className="mt-1 text-xs text-red-700">{r.error}</p> : (
                <div className="mt-1"><Badge tone={r.match ? 'success' : 'danger'}>{r.match ? 'Cocok: hash snapshot = ledger' : 'Tidak cocok'}</Badge>
                  {r.message && <p className="text-xs text-slate-600">{r.message}</p>}</div>
              ))}
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}

const METRIC_LABEL: Record<string, string> = {
  txCount: 'Jumlah transaksi on-chain', chainTxCount: 'Jumlah transaksi on-chain', recordCount: 'Jumlah catatan formal',
  totalPayloadBytes: 'Total ukuran muatan (byte)', payloadBytes: 'Ukuran muatan (byte)', auditCount: 'Jumlah peristiwa audit',
  auditLagMsAvg: 'Jeda audit rata-rata (ms)', auditLagMsMax: 'Jeda audit maksimum (ms)', auditLagMs: 'Jeda audit (ms)',
  auditPending: 'Audit tertunda', auditFailed: 'Audit gagal',
};
export function MetricsCard({ submissionId }: { submissionId: string }) {
  const q = useQuery({ queryKey: ['metrics', submissionId], queryFn: async () => (await api.get<Record<string, unknown>>(`/metrics/submissions/${submissionId}`)).data });
  if (q.isLoading) return <p className="text-sm text-slate-500">Memuat metrik…</p>;
  if (q.isError) return <p className="text-sm text-red-700">{errorMessage(q.error)}</p>;
  const entries = Object.entries(q.data ?? {}).filter(([, v]) => v === null || typeof v !== 'object');
  if (!entries.length) return <EmptyState title="Belum ada metrik" />;
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {entries.map(([k, v]) => (
        <div key={k} className="rounded-md bg-navy-50 p-3">
          <dt className="text-xs text-slate-600">{METRIC_LABEL[k] ?? k}</dt>
          <dd className="text-lg font-semibold text-navy-900">{v === null ? '—' : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
