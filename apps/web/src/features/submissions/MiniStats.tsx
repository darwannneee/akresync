import { useQuery } from '@tanstack/react-query';
import { Clock3, Database, Link2, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';
import type { AuditEventView, SubmissionDetail, User } from '../../api/types';
import { StatWidget } from '../../components/ui';
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
  return (
    <section aria-label="Statistik pengajuan" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <StatWidget tone="chain" icon={<Link2 size={20} />} label="Transaksi tercatat permanen" value={fmtNumber(totalTx, 0)} hint={`${fmtNumber(recordTx, 0)} catatan resmi, ${fmtNumber(committed, 0)} audit`} />
      <StatWidget tone="primary" icon={<Database size={20} />} label="Ukuran data tercatat" value={m ? fmtBytes(metric(m, 'payload_bytes_sum_total')) : allowed ? '…' : '—'}
        hint={m ? `Rerata ${fmtBytes(metric(m, 'payload_bytes_avg_total'))} per catatan` : allowed ? 'Memuat' : 'Tersedia bagi KEA, Majelis, dan Sekretariat'} />
      <StatWidget tone="warn" icon={<Clock3 size={20} />} label="Jeda audit rerata" value={m ? fmtDuration(metric(m, 'audit_lag_avg_ms') / 1000) : allowed ? '…' : '—'}
        hint={m ? `Terlama ${fmtDuration(metric(m, 'audit_lag_max_ms') / 1000)}` : allowed ? 'Memuat' : 'Tersedia bagi KEA, Majelis, dan Sekretariat'} />
      <StatWidget tone={failed || retrying ? 'warn' : 'success'} icon={<ShieldCheck size={20} />} label="Jejak audit tercatat" value={`${fmtNumber(committed, 0)}/${fmtNumber(auditTotal, 0)}`}
        hint={failed ? `${failed} gagal permanen, hubungi administrator` : retrying ? `${retrying} gagal sementara, dicoba ulang otomatis` : pending ? `${pending} sedang dicatat` : 'Seluruhnya tercatat permanen'} />
    </section>
  );
}
