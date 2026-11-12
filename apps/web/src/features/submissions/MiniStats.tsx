import { useQuery } from '@tanstack/react-query';
import { Clock3, Database, Link2, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';
import type { AuditEventView, SubmissionDetail, User } from '../../api/types';
import { StatWidget } from '../../components/ui';
import { fmtBytes, fmtDuration, fmtNumber } from '../../lib/labels';

const METRIC_ROLES = ['kea', 'majelis', 'sek_adm'];
type Metrics = Record<string, number>;

/** Mini-statistik pengajuan. Peran KEA, Majelis, dan Sekretariat Administrasi memakai /metrics/submissions/:id; peran lain dihitung dari rincian pengajuan. */
export function MiniStats({ s, audit, user }: { s: SubmissionDetail; audit: AuditEventView[]; user: User }) {
  const allowed = METRIC_ROLES.includes(user.role);
  const q = useQuery({ queryKey: ['metrics', s.id], enabled: allowed, queryFn: async () => (await api.get<Metrics>(`/metrics/submissions/${s.id}`)).data });
  const committed = audit.filter((e) => e.status === 'committed').length;
  const failed = audit.filter((e) => e.status === 'failed').length;
  const pending = audit.filter((e) => e.status === 'pending').length;
  const m = q.data;
  const recordTx = m ? m.tx_RECORD_total ?? 0 : (s.records ?? []).length;
  const totalTx = m ? m.tx_total ?? 0 : recordTx + committed;
  const auditTotal = audit.length;
  return (
    <section aria-label="Statistik pengajuan" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <StatWidget tone="chain" icon={<Link2 size={20} />} label="Transaksi on-chain" value={fmtNumber(totalTx, 0)} hint={`${fmtNumber(recordTx, 0)} catatan resmi, ${fmtNumber(committed, 0)} audit`} />
      <StatWidget tone="primary" icon={<Database size={20} />} label="Ukuran payload" value={m ? fmtBytes(m.payload_bytes_sum_total ?? 0) : allowed ? '…' : '—'}
        hint={m ? `Rerata ${fmtBytes(m.payload_bytes_avg_total ?? 0)} per catatan` : allowed ? 'Memuat' : 'Tersedia bagi KEA, Majelis, dan Sekretariat'} />
      <StatWidget tone="warn" icon={<Clock3 size={20} />} label="Jeda audit rerata" value={m ? fmtDuration((m.audit_lag_avg_ms ?? 0) / 1000) : allowed ? '…' : '—'}
        hint={m ? `Terlama ${fmtDuration((m.audit_lag_max_ms ?? 0) / 1000)}` : allowed ? 'Memuat' : 'Tersedia bagi KEA, Majelis, dan Sekretariat'} />
      <StatWidget tone={failed ? 'warn' : 'success'} icon={<ShieldCheck size={20} />} label="Jejak audit tercatat" value={`${fmtNumber(committed, 0)}/${fmtNumber(auditTotal, 0)}`}
        hint={failed ? `${failed} gagal, akan dicoba ulang` : pending ? `${pending} sedang diproses` : 'Seluruhnya tercatat permanen'} />
    </section>
  );
}
