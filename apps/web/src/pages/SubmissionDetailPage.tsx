import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowDown, Printer } from 'lucide-react';
import { ROLE_HOME } from '@akreditasi/shared';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, EmptyState, FormError, PageHeader, PageSkeleton, Tabs } from '../components/ui';
import { useSubmission, useSubmissionAudit } from '../features/common/queries';
import { errorMessage } from '../api/client';
import { fmtDateTime, shortId } from '../lib/labels';
import { nextActions } from '../lib/workflow';
import { StagePill } from '../features/common/StagePill';
import { MiniStats } from '../features/submissions/MiniStats';
import { StageTracker } from '../features/submissions/StageTracker';
import { NextStepCard } from '../features/submissions/NextStepCard';
import { DocumentsPanel } from '../features/submissions/DocumentsPanel';
import { RecordsTable } from '../features/submissions/Records';
import { AuditTable } from '../features/submissions/AuditTable';
import { ActivityTimeline, AssignmentsTab, ScheduleTab, SummaryTab } from '../features/submissions/DetailTabs';
import { AiTab } from '../features/ai/AiTab';
import { ProofCard, SubmissionInfo } from '../features/submissions/SummaryCards';
import type { DetailTab } from '../features/submissions/types';

export function SubmissionDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const q = useSubmission(id);
  const auditQ = useSubmissionAudit(id);
  const [tab, setTab] = useState<DetailTab>('ringkasan');
  if (!user) return null;
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <div className="space-y-4"><FormError message={errorMessage(q.error)} /><Link to={ROLE_HOME[user.role]}><Button variant="secondary" icon={<ArrowLeft size={16} />}>Kembali ke beranda</Button></Link></div>;
  const s = q.data;
  const audit = auditQ.data ?? s.audit ?? [];
  const hasAction = nextActions(s, user).actions.length > 0;
  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: 'ringkasan', label: 'Ringkasan' },
    { id: 'dokumen', label: 'Dokumen', count: s.documents?.length },
    { id: 'penilaian', label: 'Penugasan dan Penilaian' },
    { id: 'jadwal', label: 'Jadwal AL', count: s.alSchedules?.length },
    { id: 'catatan', label: 'Catatan resmi', count: s.records?.length },
    { id: 'audit', label: 'Jejak audit', count: audit.length },
    ...(user.role !== 'sek_keu' && s.aiProgress?.enabled ? [{ id: 'ai' as const, label: 'Analisis AI' }] : []),
    { id: 'aktivitas', label: 'Aktivitas' },
  ];
  const panel = (t: DetailTab, node: React.ReactNode) => <div role="tabpanel" id={`panel-${t}`} aria-labelledby={`tab-${t}`} className={t === tab ? 'block' : 'hidden print-block'}>{node}</div>;
  const name = s.programName ? `${s.programName}${s.programLevel ? ` (${s.programLevel})` : ''}` : `Pengajuan ${shortId(id)}`;
  return (
    <div>
      <div className="print-only mb-4 border-b-2 border-slate-400 pb-2"><p className="text-lg font-medium">Sistem Akreditasi Program Studi</p><p className="text-sm">Ringkasan pengajuan, dicetak {fmtDateTime(new Date().toISOString())}</p></div>
      <PageHeader title={name} crumbs={[{ label: 'Pengajuan', to: ROLE_HOME[user.role] }, { label: 'Detail' }]}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1.5"><span>{s.institutionName}</span><StagePill stage={s.stage} /></span>}
        actions={<>
          {hasAction && <a href="#tindakan"><Button icon={<ArrowDown size={15} />}>Kerjakan tugas</Button></a>}
          <Button variant="secondary" icon={<Printer size={15} />} onClick={() => window.print()}>Cetak</Button>
        </>} />
      <div className="space-y-6">
        <SubmissionInfo s={s} />
        <NextStepCard s={s} user={user} goTab={setTab} />
        <div className="card">
          <div className="px-4 pt-1 sm:px-5"><Tabs label="Bagian pengajuan" tabs={tabs} value={tab} onChange={setTab} /></div>
          <div className="p-4 sm:p-5">
            {panel('ringkasan', <div className="space-y-6"><MiniStats s={s} audit={audit} user={user} /><Card title="Alur Akreditasi"><StageTracker d={s} audit={audit} /></Card><SummaryTab s={s} /><ProofCard s={s} audit={audit} /></div>)}
            {panel('dokumen', <DocumentsPanel docs={s.documents ?? []} currentVersion={s.documentSetVersion} />)}
            {panel('penilaian', <AssignmentsTab s={s} />)}
            {panel('jadwal', <ScheduleTab s={s} />)}
            {panel('catatan', <RecordsTable submissionId={id} records={s.records ?? []} user={user} />)}
            {panel('audit', auditQ.isLoading ? <EmptyState title="Memuat jejak audit…" /> : <AuditTable events={audit} />)}
            {s.aiProgress?.enabled && user.role !== 'sek_keu' && panel('ai', <AiTab s={s} user={user} />)}
            {panel('aktivitas', <ActivityTimeline s={s} audit={audit} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
