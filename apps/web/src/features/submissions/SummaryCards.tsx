import type { AuditEventView, SubmissionDetail } from '../../api/types';
import { Notice } from '../../components/ui';
import { RECORD_LABEL, auditSummaryText, countAudit, fmtDateTime } from '../../lib/labels';
import { recordTime } from '../../lib/workflow';
import { VerifyAll } from './AuditTable';

/** Ringkasan bukti pencatatan: jumlah catatan resmi, catatan terakhir, pemeriksaan keutuhan. */
export function ProofCard({ s, audit }: { s: SubmissionDetail; audit: AuditEventView[] }) {
  const records = s.records ?? [];
  const last = [...records].sort((a, b) => String(recordTime(a)).localeCompare(String(recordTime(b)))).pop();
  const n = countAudit(audit);
  const note = auditSummaryText(n);
  return (
    <section aria-label="Bukti pencatatan">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <div className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-faint">Bukti pencatatan</div>
          <div className="mt-2 flex items-baseline gap-2"><span className="text-[28px] font-semibold leading-none tabular-nums text-ink">{records.length}</span><span className="text-muted">catatan resmi tercatat permanen</span></div>
          <p className="mt-1 text-[13.5px] text-faint">Catatan terakhir: {last ? <>{RECORD_LABEL[last.recordType] ?? last.recordType}, {fmtDateTime(recordTime(last))}</> : 'belum ada'}</p>
        </div>
        <div className="no-print sm:ml-auto sm:w-56"><VerifyAll events={audit} /></div>
      </div>
      {note && <div className="mt-3"><Notice tone={n.failed ? 'danger' : 'warn'}>{note}</Notice></div>}
    </section>
  );
}
