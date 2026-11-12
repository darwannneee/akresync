import { Link2 } from 'lucide-react';
import type { AuditEventView, SubmissionDetail } from '../../api/types';
import { Card, DL, Notice } from '../../components/ui';
import { AK_LABEL, AL_LABEL, RECORD_LABEL, fmtDateTime, shortId } from '../../lib/labels';
import { recordTime } from '../../lib/workflow';
import { VerifyAll } from './AuditTable';

export function RightPanel({ s, audit }: { s: SubmissionDetail; audit: AuditEventView[] }) {
  const records = s.records ?? [];
  const last = [...records].sort((a, b) => String(recordTime(a)).localeCompare(String(recordTime(b)))).pop();
  const pending = audit.filter((e) => e.status === 'pending').length;
  const failed = audit.filter((e) => e.status === 'failed').length;
  return (
    <div className="space-y-5">
      <Card title="Ringkasan">
        <DL cols={1} items={[['Nomor pengajuan', <span key="i" className="font-mono text-sm">{shortId(s.id)}</span>], ['Program studi', s.programName ? `${s.programName}${s.programLevel ? ` (${s.programLevel})` : ''}` : '—'], ['Institusi', s.institutionName], ['Dibuat', fmtDateTime(s.createdAt)], ['Diperbarui', fmtDateTime(s.updatedAt)], ['Versi himpunan dokumen', s.documentSetVersion], ['Asesmen Kecukupan', AK_LABEL[s.akStatus]], ['Jadwal Asesmen Lapangan', AL_LABEL[s.alScheduleStatus]]]} />
      </Card>
      <Card title="Bukti pencatatan">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-chain-bg text-chain"><Link2 size={22} aria-hidden /></span>
          <div><div className="font-display text-3xl font-bold leading-none text-navy-900">{records.length}</div><p className="mt-1 text-sm text-muted">catatan resmi tercatat permanen</p></div>
        </div>
        <p className="mt-4 text-sm"><span className="text-faint">Catatan terakhir: </span>{last ? <><b>{RECORD_LABEL[last.recordType] ?? last.recordType}</b>, {fmtDateTime(recordTime(last))}</> : 'belum ada'}</p>
        {(pending > 0 || failed > 0) && <div className="mt-3"><Notice tone={failed ? 'danger' : 'warn'}>{pending > 0 && `${pending} jejak audit sedang dicatat. `}{failed > 0 && `${failed} jejak audit belum berhasil dicatat dan akan dicoba ulang.`}</Notice></div>}
        <div className="no-print mt-4"><VerifyAll events={audit} /></div>
      </Card>
    </div>
  );
}
