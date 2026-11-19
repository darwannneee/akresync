import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { AuditEventView, SubmissionDetail, User } from '../../api/types';
import { countAudit, fmtBytes, fmtDuration, fmtNumber } from '../../lib/labels';

const METRIC_ROLES = ['kea', 'majelis', 'sek_adm'];
type Metrics = Record<string, number>;
/** Klien mengubah snake_case menjadi camelCase; metrik dibaca dengan nama aslinya maupun bentuk camelCase-nya. */
const camelKey = (k: string) => k.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
const metric = (m: Metrics | undefined, k: string): number => Number(m?.[k] ?? m?.[camelKey(k)] ?? 0);

/** Mini-statistik pengajuan. Peran KEA, Majelis, dan Sekretariat Administrasi memakai /metrics/submissions/:id; peran lain dihitung dari rincian pengajuan. */
export function MiniStats({ s, audit, user }: { s: SubmissionDetail; audit: AuditEventView[]; user: User }) {
  const allowed = METRIC_ROLES.includes(user.role);
  const q = useQuery({ queryKey: ['metrics', s.id], enabled: allowed, queryFn: async () => (await api.get<Metrics>(`/metrics/submissions/${s.id}`)).data });
  const { committed, failed, pending, retrying } = countAudit(audit);
  const m = q.data;
  // Hitungan catatan resmi selalu mengikuti tab Catatan resmi; metrik server dipakai untuk ukuran dan jeda.
  const recordTx = (s.records ?? []).length;
  const totalTx = recordTx + committed;
  const auditTotal = audit.length;
  const restricted = 'Tersedia bagi KEA, Majelis, dan Sekretariat';
  return (
    <section aria-label="Statistik pencatatan" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <Tile label="Transaksi tercatat permanen" value={fmtNumber(totalTx, 0)} hint={`${fmtNumber(recordTx, 0)} catatan resmi, ${fmtNumber(committed, 0)} audit`} />
      <Tile label="Ukuran data tercatat" value={m ? fmtBytes(metric(m, 'payload_bytes_sum_total')) : allowed ? '…' : '—'}
        hint={m ? `Rerata ${fmtBytes(metric(m, 'payload_bytes_avg_total'))} per catatan` : allowed ? 'Memuat' : restricted} />
      <Tile label="Jeda audit rerata" value={m ? fmtDuration(metric(m, 'audit_lag_avg_ms') / 1000) : allowed ? '…' : '—'}
        hint={m ? `Terlama ${fmtDuration(metric(m, 'audit_lag_max_ms') / 1000)}` : allowed ? 'Memuat' : restricted} />
      <Tile label="Jejak audit tercatat" value={`${fmtNumber(committed, 0)}/${fmtNumber(auditTotal, 0)}`}
        hint={failed ? `${failed} gagal permanen, hubungi administrator` : retrying ? `${retrying} gagal sementara, dicoba ulang otomatis` : pending ? `${pending} sedang dicatat` : 'Seluruhnya tercatat permanen'} />
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-[13px] text-faint">{label}</div>
      <div className="mt-1 text-[20px] font-semibold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-[13px] text-faint">{hint}</div>}
    </div>
  );
}
