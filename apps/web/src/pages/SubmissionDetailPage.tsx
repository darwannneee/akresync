import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Card, DL, FormError, PageHeader, Spinner } from '../components/ui';
import { ROLE_HOME } from '@akreditasi/shared';
import { useSubmission, useSubmissionAudit } from '../features/common/queries';
import { AK_LABEL, AL_LABEL, StageBadge, fmtDate } from '../features/common/labels';
import { errorMessage } from '../api/client';
import { StageStepper } from '../features/submissions/StageStepper';
import { ActionPanel } from '../features/submissions/ActionPanel';
import { DocumentsPanel } from '../features/submissions/DocumentsPanel';
import { RecordsTable } from '../features/submissions/Records';
import { AuditTable, MetricsCard } from '../features/submissions/AuditTable';

export function SubmissionDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const q = useSubmission(id);
  const audit = useSubmissionAudit(id);
  if (!user) return null;
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <FormError message={errorMessage(q.error)} />;
  const s = q.data;
  const events = audit.data ?? s.audit ?? [];
  const showMetrics = ['kea', 'majelis', 'sek_adm'].includes(user.role);
  return (
    <div className="space-y-4">
      <PageHeader
        title={s.programName ? `${s.programName}${s.programLevel ? ` (${s.programLevel})` : ''}` : `Pengajuan ${id.slice(0, 8)}`}
        subtitle={<><Link className="text-navy-700 underline" to={ROLE_HOME[user.role]}>← Kembali ke dasbor</Link> · {s.institutionName}</>}
        actions={<StageBadge stage={s.stage} />}
      />
      <Card title="Posisi tahap">
        <StageStepper s={s} />
        <div className="mt-4"><DL items={[['Status AK', AK_LABEL[s.akStatus]], ['Status jadwal AL', AL_LABEL[s.alScheduleStatus]], ['Versi set dokumen', s.documentSetVersion], ['Diperbarui', fmtDate(s.updatedAt)]]} /></div>
      </Card>
      <ActionPanel s={s} user={user} />
      <Card title="Dokumen"><DocumentsPanel docs={s.documents ?? []} /></Card>
      <Card title="Catatan formal on-chain"><RecordsTable submissionId={id} records={s.records ?? []} user={user} /></Card>
      <Card title="Peristiwa audit">{audit.isLoading ? <Spinner /> : <AuditTable events={events} />}</Card>
      {showMetrics && <Card title="Metrik pengajuan"><MetricsCard submissionId={id} /></Card>}
    </div>
  );
}
