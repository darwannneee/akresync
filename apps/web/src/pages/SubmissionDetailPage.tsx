import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Printer, ArrowLeft, UserCheck } from 'lucide-react';
import { ROLE_HOME } from '@akreditasi/shared';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, EmptyState, FormError, PageSkeleton, Tabs } from '../components/ui';
import { useSubmission, useSubmissionAudit } from '../features/common/queries';
import { StagePill } from '../features/common/StagePill';
import { errorMessage } from '../api/client';
import { fmtDateTime, shortId } from '../lib/labels';
import { holderLabel } from '../lib/workflow';
import { StageTracker } from '../features/submissions/StageTracker';
import { NextStepCard } from '../features/submissions/NextStepCard';
import { DocumentsPanel } from '../features/submissions/DocumentsPanel';
import { RecordsTable } from '../features/submissions/Records';
import { AuditTable } from '../features/submissions/AuditTable';
import { ActivityTimeline, AssignmentsTab, ScheduleTab, SummaryTab } from '../features/submissions/DetailTabs';
import { RightPanel } from '../features/submissions/RightPanel';
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
  const showMetrics = ['kea', 'majelis', 'sek_adm'].includes(user.role);
  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: 'ringkasan', label: 'Ringkasan' },
    { id: 'dokumen', label: 'Dokumen', count: s.documents?.length },
    { id: 'penilaian', label: 'Penugasan dan Penilaian' },
    { id: 'jadwal', label: 'Jadwal AL', count: s.alSchedules?.length },
    { id: 'catatan', label: 'Catatan resmi', count: s.records?.length },
    { id: 'audit', label: 'Jejak audit', count: audit.length },
    { id: 'aktivitas', label: 'Aktivitas' },
  ];
  const panel = (t: DetailTab, node: React.ReactNode) => <div role="tabpanel" id={`panel-${t}`} aria-labelledby={`tab-${t}`} className={t === tab ? 'block' : 'hidden print-block'}>{node}</div>;
  return (
    <div>
      <div className="print-only mb-4 border-b-2 border-accent pb-2"><p className="font-display text-lg font-bold">Sistem Akreditasi Program Studi</p><p className="text-sm">Ringkasan pengajuan, dicetak {fmtDateTime(new Date().toISOString())}</p></div>
      <header className="mb-6">
        <Link to={ROLE_HOME[user.role]} className="no-print mb-3 inline-flex items-center gap-1 text-sm text-navy-700 hover:underline"><ArrowLeft size={15} aria-hidden />Kembali ke daftar</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{s.programName ? `${s.programName}${s.programLevel ? ` (${s.programLevel})` : ''}` : `Pengajuan ${shortId(id)}`}</h1>
            <p className="mt-1 text-base text-muted">{s.institutionName}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[13px] text-slate-700" title={id}>No. {shortId(id)}</span>
              <StagePill stage={s.stage} />
              <span className="inline-flex items-center gap-1.5 text-ink"><UserCheck size={16} className="text-navy-700" aria-hidden />Sedang ditangani: <b>{holderLabel(s)}</b></span>
              <span className="text-muted">Diperbarui {fmtDateTime(s.updatedAt)}</span>
            </div>
          </div>
          <Button variant="secondary" className="no-print" icon={<Printer size={16} />} onClick={() => window.print()}>Cetak</Button>
        </div>
      </header>

      <div className="space-y-6">
        <NextStepCard s={s} user={user} goTab={setTab} />
        <Card title="Posisi pengajuan dalam alur akreditasi" description="Pilih salah satu tahap untuk melihat siapa yang bertanggung jawab, kapan selesai, dan buktinya."><StageTracker d={s} audit={audit} /></Card>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-5">
            <Tabs label="Bagian pengajuan" tabs={tabs} value={tab} onChange={setTab} />
            {panel('ringkasan', <SummaryTab s={s} showMetrics={showMetrics} />)}
            {panel('dokumen', <DocumentsPanel docs={s.documents ?? []} currentVersion={s.documentSetVersion} />)}
            {panel('penilaian', <AssignmentsTab s={s} />)}
            {panel('jadwal', <ScheduleTab s={s} />)}
            {panel('catatan', <RecordsTable submissionId={id} records={s.records ?? []} user={user} />)}
            {panel('audit', auditQ.isLoading ? <EmptyState title="Memuat jejak audit…" /> : <AuditTable events={audit} />)}
            {panel('aktivitas', <ActivityTimeline s={s} audit={audit} />)}
          </div>
          <RightPanel s={s} audit={audit} />
        </div>
      </div>
    </div>
  );
}
