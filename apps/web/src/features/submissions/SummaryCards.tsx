import { Link2 } from 'lucide-react';
import type { AuditEventView, SubmissionDetail } from '../../api/types';
import { Card, InfoTable, Notice } from '../../components/ui';
import { AK_LABEL, AL_LABEL, RECORD_LABEL, auditSummaryText, countAudit, fmtDateTime, shortId } from '../../lib/labels';
import { holderLabel, recordTime } from '../../lib/workflow';
import { StagePill } from '../common/StagePill';
import { VerifyAll } from './AuditTable';

/** Ringkasan pengajuan: dua tabel label : nilai berdampingan. */
export function SubmissionInfo({ s }: { s: SubmissionDetail }) {
  return (
    <Card title="Ringkasan Pengajuan">
      <div className="grid gap-4 lg:grid-cols-2">
        <InfoTable items={[
          ['Program studi', s.programName ? `${s.programName}${s.programLevel ? ` (${s.programLevel})` : ''}` : '—'],
          ['Institusi', s.institutionName],
          ['Nomor pengajuan', <span key="i" className="font-mono text-xs" title={s.id}>{shortId(s.id)}</span>],
          ['Posisi', <StagePill key="p" stage={s.stage} />],
          ['Sedang ditangani', holderLabel(s)],
        ]} />
        <InfoTable items={[
          ['Dibuat', fmtDateTime(s.createdAt)],
          ['Diperbarui', fmtDateTime(s.updatedAt)],
          ['Versi himpunan dokumen', s.documentSetVersion],
          ['Asesmen Kecukupan', AK_LABEL[s.akStatus]],
          ['Jadwal Asesmen Lapangan', AL_LABEL[s.alScheduleStatus]],
        ]} />
      </div>
    </Card>
  );
}

export function ProofCard({ s, audit }: { s: SubmissionDetail; audit: AuditEventView[] }) {
  const records = s.records ?? [];
  const last = [...records].sort((a, b) => String(recordTime(a)).localeCompare(String(recordTime(b)))).pop();
  const n = countAudit(audit);
  const note = auditSummaryText(n);
  return (
    <Card title="Bukti Pencatatan">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-chain-bg text-chain"><Link2 size={21} aria-hidden /></span>
          <div><div className="text-2xl font-medium leading-none text-ink">{records.length}</div><p className="mt-0.5 text-sm text-muted">catatan resmi tercatat permanen</p></div>
        </div>
        <p className="text-sm"><span className="text-faint">Catatan terakhir: </span>{last ? <><b className="font-medium">{RECORD_LABEL[last.recordType] ?? last.recordType}</b>, {fmtDateTime(recordTime(last))}</> : 'belum ada'}</p>
        <div className="no-print sm:ml-auto sm:w-56"><VerifyAll events={audit} /></div>
      </div>
      {note && <div className="mt-3"><Notice tone={n.failed ? 'danger' : 'warn'}>{note}</Notice></div>}
    </Card>
  );
}
