import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck, ChevronRight, ClipboardCheck, FileCheck2, FileUp, Gavel, Plus, Search, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, ButtonLink, Card, DataTable, FormError, Notice, Select, Skeleton, StatusDot } from '../components/ui';
import { ActivityCard, AiCard, IntegrityCard, ProofCard, RanksCard, RunningCard, STAGE_STEPS, StagesCard, SummaryCard, TrendCard } from '../features/dashboard/panels';
import { useDashboardStats } from '../features/common/queries';
import { useTaskQueue, type TaskItem } from '../features/common/useTasks';
import { errorMessage } from '../api/client';
import { AiScoreInline } from '../features/ai/parts';
import { usePendingRegistrationCount } from '../features/sekretariat/uppsRegistrations';
import { STAGE_LABEL, fmtDateTime, roleName, shortId } from '../lib/labels';
import { currentIndex, type ActionKey } from '../lib/workflow';
import type { SubmissionSummary } from '../api/types';

const STAGE_FILTERS = [{ v: '', label: 'Semua tahap' }, ...STAGE_STEPS.map((l, i) => ({ v: String(i), label: `Tahap ${i + 1}. ${l}` })), { v: '9', label: 'Selesai' }];
const PAGE = 10;
const ICON: Partial<Record<ActionKey, typeof FileUp>> = {
  compose_submission: FileUp, upload_proof: FileUp, offer: Users, reoffer: Users, review_rejection: Users, respond_offer: Users, respond_offer_upps: Users,
  propose_schedule: CalendarCheck, decide_schedule: CalendarCheck, decision: Gavel, issue_certificate: FileCheck2,
};

const greeting = () => { const h = new Date().getHours(); return h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam'; };
const firstSentence = (s: string) => s.split('. ')[0]!.replace(/\.$/, '');
const progName = (s: SubmissionSummary) => `${s.programName ?? shortId(s.id)}${s.programLevel ? ` (${s.programLevel})` : ''}`;

function TaskRow({ t }: { t: TaskItem }) {
  const Icon = ICON[t.action.key] ?? ClipboardCheck;
  return (
    <li className="flex flex-wrap items-center gap-4 px-[22px] py-5 sm:flex-nowrap">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-700" aria-hidden><Icon size={20} strokeWidth={1.7} /></span>
      <div className="min-w-0 flex-1"><div className="font-semibold text-ink">{t.action.title}</div><div className="mt-0.5 text-[14px] text-muted">{progName(t.submission)} · {firstSentence(t.action.why)}</div></div>
      <ButtonLink to={t.action.to?.(t.submission.id) ?? `/pengajuan/${t.submission.id}`}>{t.action.button}</ButtonLink>
    </li>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const { rows, tasks, counts, loading, query } = useTaskQueue();
  const pendingRegs = usePendingRegistrationCount(user?.role === 'sek_adm');
  const statsQ = useDashboardStats();
  const stats = statsQ.data;
  const [stage, setStage] = useState('');
  const [text, setText] = useState(params.get('q') ?? '');
  const [page, setPage] = useState(1);
  useEffect(() => { const q = params.get('q'); if (q !== null) setText(q); }, [params]);
  useEffect(() => setPage(1), [text, stage]);
  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    return rows.filter((s) => (stage === '' || String(currentIndex(s)) === stage) && (!q || `${s.programName ?? ''} ${s.institutionName ?? ''} ${s.id} ${shortId(s.id)}`.toLowerCase().includes(q)));
  }, [rows, stage, text]);
  if (!user) return null;
  // Metrik teknis (blok, jeda audit, AI) hanya untuk peran yang memerlukannya.
  const technical = ['kea', 'majelis', 'sek_adm'].includes(user.role);
  const upps = user.role === 'upps';
  const mine = new Set(tasks.map((t) => t.submission.id));
  const tone = (s: SubmissionSummary) => s.stage === 'released' ? 'ok' : s.stage === 'admin_rejected' ? 'bad' : mine.has(s.id) ? 'navy' : 'warn';
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const visible = filtered.slice((cur - 1) * PAGE, cur * PAGE);
  const showAi = filtered.some((x) => x.aiScore);
  const first = loading && !rows.length;
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-ink sm:text-[26px]">Selamat {greeting()}, Bapak/Ibu {user.fullName}</h1>
          <p className="mt-1 text-[15px] text-muted">{upps ? user.institutionName ?? roleName(user.role) : roleName(user.role)}{first ? '' : ` · ${rows.length} pengajuan`}</p>
        </div>
        {upps && <ButtonLink to="/upps/baru" variant="secondary" icon={<Plus size={16} />}>Ajukan akreditasi</ButtonLink>}
      </div>
      {query.isError && <div className="mb-6"><FormError message={errorMessage(query.error)} /></div>}
      {user.role === 'sek_adm' && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 px-[22px] py-3.5">
          <StatusDot tone={pendingRegs ? 'warn' : 'gray'} className="!text-[14.5px] !text-ink">{pendingRegs ? `${pendingRegs} pendaftaran akun UPPS menunggu verifikasi Bapak/Ibu.` : 'Tidak ada pendaftaran akun UPPS yang menunggu verifikasi.'}</StatusDot>
          <ButtonLink to="/sekretariat/administrasi/akun-upps" size="sm" variant={pendingRegs ? 'primary' : 'ghost'}>Verifikasi akun UPPS</ButtonLink>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-8">
          <Card id="tugas-saya" title="Perlu Bapak/Ibu kerjakan" actions={first ? undefined : `${tasks.length} tugas`} flush>
            {first ? <div className="space-y-3 p-[22px]"><Skeleton className="h-11" /><Skeleton className="h-11" /></div>
              : !tasks.length ? <p className="px-[22px] py-6 text-muted">Tidak ada tugas saat ini. Daftar ini terisi otomatis bila ada pengajuan yang memerlukan tindakan Bapak/Ibu.</p>
                : tasks.length <= 5 ? <ul className="divide-y divide-line">{tasks.map((t) => <TaskRow key={`${t.submission.id}-${t.action.key}`} t={t} />)}</ul>
                  : (
                    <div className="p-[22px]">
                      <DataTable toolbar rows={tasks} rowKey={(t) => `${t.submission.id}-${t.action.key}`} caption="Tugas Bapak/Ibu" pageSize={10}
                        search={(t) => `${t.action.title} ${t.submission.programName ?? ''} ${t.submission.institutionName ?? ''} ${shortId(t.submission.id)}`}
                        columns={[
                          { key: 't', header: 'Tugas', primary: true, cell: (t) => <span className="font-medium text-ink">{t.action.title}</span> },
                          { key: 'p', header: 'Program studi', cell: (t) => <div><div className="text-ink">{progName(t.submission)}</div>{!upps && <div className="text-[13px] text-faint">{t.submission.institutionName}</div>}</div> },
                          { key: 'u', header: 'Diperbarui', cell: (t) => <span className="whitespace-nowrap text-[13px] text-faint">{fmtDateTime(t.submission.updatedAt)}</span> },
                          { key: 'a', header: 'Aksi', cell: (t) => <ButtonLink size="sm" to={t.action.to?.(t.submission.id) ?? `/pengajuan/${t.submission.id}`}>{t.action.button}</ButtonLink> },
                        ]} />
                    </div>
                  )}
          </Card>

          <Card title="Pengajuan" flush actions={
            <>
              <label className="relative block w-full sm:w-56">
                <span className="sr-only">Cari pengajuan</span>
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
                <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Cari" className="input !min-h-[38px] !py-1 pl-9" />
              </label>
              <Select aria-label="Saring menurut tahap" value={stage} onChange={(e) => setStage(e.target.value)} className="!min-h-[38px] !w-auto max-w-[14rem] !py-1">{STAGE_FILTERS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</Select>
            </>
          }>
            {first ? <div className="p-[22px]"><Skeleton className="h-32" /></div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[14.5px]">
                  <caption className="sr-only">Daftar pengajuan</caption>
                  <thead><tr className="border-b border-line text-left text-[13px] text-faint">
                    <th scope="col" className="px-[22px] py-3 font-medium">Program studi</th>
                    <th scope="col" className="px-3 py-3 font-medium">Posisi</th>
                    {showAi && <th scope="col" className="px-3 py-3 text-right font-medium">Skor AI</th>}
                    <th scope="col" className="px-3 py-3 font-medium">Diperbarui</th>
                    <th scope="col" className="px-[22px] py-3"><span className="sr-only">Aksi</span></th>
                  </tr></thead>
                  <tbody className="divide-y divide-line">
                    {!visible.length && <tr><td colSpan={showAi ? 5 : 4} className="px-[22px] py-8 text-center text-muted">{rows.length ? 'Tidak ada pengajuan yang sesuai. Ubah kata kunci atau pilih Semua tahap.' : 'Belum ada pengajuan.'}</td></tr>}
                    {visible.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/70">
                        <td className="px-[22px] py-4"><div className="font-semibold text-ink">{progName(s)}</div><div className="text-[13px] text-faint">{[!upps && s.institutionName, s.stage === 'draft' ? 'Draf' : shortId(s.id)].filter(Boolean).join(' · ')}</div></td>
                        <td className="px-3 py-4"><StatusDot tone={tone(s)}>{STAGE_LABEL[s.stage] ?? s.stage}</StatusDot></td>
                        {showAi && <td className="whitespace-nowrap px-3 py-4 text-right">{s.aiScore ? <AiScoreInline totals={s.aiScore.totals} note={false} /> : <span className="text-faint">—</span>}</td>}
                        <td className="whitespace-nowrap px-3 py-4 text-[13px] text-faint">{fmtDateTime(s.updatedAt)}</td>
                        <td className="px-[22px] py-4 text-right"><ButtonLink to={`/pengajuan/${s.id}`} variant="ghost" size="sm">Buka</ButtonLink></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pages > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-[22px] py-3 text-[13.5px] text-faint">
                    <span aria-live="polite">{(cur - 1) * PAGE + 1}–{Math.min(cur * PAGE, filtered.length)} dari {filtered.length} pengajuan</span>
                    <span className="flex gap-2">
                      <Button size="sm" variant="secondary" disabled={cur === 1} onClick={() => setPage(cur - 1)}>Sebelumnya</Button>
                      <Button size="sm" variant="secondary" disabled={cur === pages} onClick={() => setPage(cur + 1)}>Berikutnya</Button>
                    </span>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-4">
          {upps && <RunningCard rows={rows} />}
          {technical && <SummaryCard stats={stats} actionCount={counts.action} />}
          <ProofCard stats={stats} loading={statsQ.isLoading} />
          {statsQ.isError && <Notice tone="warn" title="Statistik belum dapat dimuat">{errorMessage(statsQ.error)}</Notice>}
        </div>
      </div>

      {stats && (
        <details className="group mt-8">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-[10px] px-1 py-1 text-[14.5px] font-semibold text-navy-700 hover:text-navy-800">
            <ChevronRight size={16} aria-hidden className="transition-transform group-open:rotate-90" />Statistik lengkap
          </summary>
          <div className="mt-4 grid items-stretch gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 [&>section]:h-full"><StagesCard stats={stats} title={upps ? 'Pengajuan saya per tahap' : 'Pengajuan per tahap'} /></div>
            <RanksCard stats={stats} />
            <div className="lg:col-span-2 [&>section]:h-full"><TrendCard stats={stats} /></div>
            <IntegrityCard stats={stats} detailed={technical} />
            {technical && <AiCard stats={stats} />}
            <div className={technical ? 'lg:col-span-2 [&>section]:h-full' : 'lg:col-span-3 [&>section]:h-full'}><ActivityCard stats={stats} wide={!technical} /></div>
          </div>
        </details>
      )}
    </div>
  );
}
