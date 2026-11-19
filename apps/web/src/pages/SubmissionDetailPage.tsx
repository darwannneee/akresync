import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Printer } from 'lucide-react';
import { ROLE_HOME } from '@akreditasi/shared';
import { useAuth } from '../auth/AuthContext';
import { Button, ButtonLink, EmptyState, FormError, PageSkeleton, Tabs } from '../components/ui';
import { useSubmission, useSubmissionAudit } from '../features/common/queries';
import { errorMessage } from '../api/client';
import { fmtDateTime, shortId } from '../lib/labels';
import { MiniStats } from '../features/submissions/MiniStats';
import { NextStepCard } from '../features/submissions/NextStepCard';
import { DocumentsPanel } from '../features/submissions/DocumentsPanel';
import { RecordsTable } from '../features/submissions/Records';
import { AuditTable } from '../features/submissions/AuditTable';
import { ActivityTimeline, AssessmentTab, SummaryTab } from '../features/submissions/DetailTabs';
import { AiTab } from '../features/ai/AiTab';
import { ProofCard } from '../features/submissions/SummaryCards';
import { AI_TAB_ROLES, type DetailTab } from '../features/submissions/types';

export function SubmissionDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const q = useSubmission(id);
  const auditQ = useSubmissionAudit(id);
  const [tab, setTab] = useState<DetailTab>('ringkasan');
  if (!user) return null;
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <div className="space-y-4"><FormError message={errorMessage(q.error)} /><ButtonLink to={ROLE_HOME[user.role]} variant="secondary" icon={<ArrowLeft size={16} />}>Kembali ke beranda</ButtonLink></div>;
  const s = q.data;
  const audit = auditQ.data ?? s.audit ?? [];
  const showAi = AI_TAB_ROLES.includes(user.role);
  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: 'ringkasan', label: 'Ringkasan' },
    { id: 'dokumen', label: 'Dokumen', count: s.documents?.length },
    { id: 'asesmen', label: 'Asesmen' },
    { id: 'riwayat', label: 'Riwayat' },
    ...(showAi ? [{ id: 'ai' as const, label: 'Analisis AI' }] : []),
  ];
  const panel = (t: DetailTab, node: React.ReactNode) => <div role="tabpanel" id={`panel-${t}`} aria-labelledby={`tab-${t}`} className={t === tab ? 'block' : 'hidden print-block'}>{node}</div>;
  const name = s.programName ? `${s.programName}${s.programLevel ? ` (${s.programLevel})` : ''}` : `Pengajuan ${shortId(id)}`;
  const sub = (title: string, count: number | undefined, node: React.ReactNode) => (
    <section>
      <h3 className="mb-3 text-[15px] font-semibold text-ink">{title}{!!count && <span className="ml-1.5 text-[13px] font-normal tabular-nums text-faint">{count}</span>}</h3>
      {node}
    </section>
  );
  return (
    <div>
      <div className="print-only mb-4 border-b-2 border-slate-400 pb-2"><p className="text-lg font-medium">Sistem Akreditasi Program Studi</p><p className="text-sm">Ringkasan pengajuan, dicetak {fmtDateTime(new Date().toISOString())}</p></div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[14px] text-faint">{s.institutionName ? `${s.institutionName} · ` : ''}<span title={s.id}>{shortId(s.id)}</span></div>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">{name}</h1>
        </div>
        <Button variant="secondary" className="no-print" icon={<Printer size={16} />} onClick={() => window.print()}>Cetak</Button>
      </div>
      <div className="mt-6 space-y-6">
        <NextStepCard s={s} user={user} audit={audit} goTab={setTab} />
        <div className="card">
          <div className="px-[22px]"><Tabs label="Bagian pengajuan" tabs={tabs} value={tab} onChange={setTab} /></div>
          <div className="p-[22px]">
            {panel('ringkasan', <SummaryTab s={s} audit={audit} user={user} onHistory={() => setTab('riwayat')} />)}
            {panel('dokumen', <DocumentsPanel docs={s.documents ?? []} currentVersion={s.documentSetVersion} role={user.role} />)}
            {panel('asesmen', <AssessmentTab s={s} />)}
            {panel('riwayat', (
              <div className="space-y-8">
                <ActivityTimeline s={s} audit={audit} />
                <details className="group rounded-xl border border-line">
                  <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-[18px] py-3 [&::-webkit-details-marker]:hidden">
                    <span><span className="block text-[15px] font-semibold text-ink">Bukti pencatatan dan rincian teknis</span><span className="block text-[13.5px] text-faint">Catatan resmi, jejak audit, nomor transaksi, dan pemeriksaan keutuhan</span></span>
                    <ChevronDown size={18} className="shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="space-y-8 border-t border-line p-[18px]">
                    <ProofCard s={s} audit={audit} />
                    <MiniStats s={s} audit={audit} user={user} />
                    {sub('Catatan resmi', s.records?.length, <RecordsTable submissionId={id} records={s.records ?? []} user={user} />)}
                    {sub('Jejak audit', audit.length, auditQ.isLoading ? <EmptyState title="Memuat jejak audit…" /> : <AuditTable events={audit} />)}
                  </div>
                </details>
              </div>
            ))}
            {showAi && panel('ai', tab === 'ai' || !!s.aiProgress?.enabled ? <AiTab s={s} user={user} /> : null)}
          </div>
        </div>
      </div>
    </div>
  );
}
