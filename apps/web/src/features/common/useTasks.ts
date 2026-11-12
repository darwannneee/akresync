import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import type { SubmissionDetail, SubmissionSummary } from '../../api/types';
import { nextActions, type NextAction } from '../../lib/workflow';
import { fetchSubmission, useSubmissions } from './queries';

export interface TaskItem { submission: SubmissionSummary; action: NextAction }

export const isFinished = (s: SubmissionSummary) => s.stage === 'released' || s.stage === 'admin_rejected';

/**
 * Antrean tugas pengguna. Untuk UPPS dan Asesor (tugas bergantung pada penugasan pribadi) serta penolakan penawaran KEA,
 * rincian pengajuan dimuat agar tindakan yang ditampilkan akurat.
 */
export function useTaskQueue() {
  const { user } = useAuth();
  const q = useSubmissions();
  const rows = useMemo(() => q.data ?? [], [q.data]);
  const needDetail = useMemo(() => rows.filter((s) => !isFinished(s) && !!user && (user.role === 'upps' || user.role === 'asesor' || (user.role === 'kea' && s.akStatus === 'offer_rejected'))).slice(0, 40), [rows, user]);
  const details = useQueries({ queries: needDetail.map((s) => ({ queryKey: ['submission', s.id], queryFn: () => fetchSubmission(s.id), staleTime: 15_000 })) });
  const byId = new Map<string, SubmissionDetail>();
  details.forEach((d, i) => { if (d.data) byId.set(needDetail[i]!.id, d.data); });
  const detailsLoading = details.some((d) => d.isLoading);

  const tasks = useMemo<TaskItem[]>(() => {
    if (!user) return [];
    const out: TaskItem[] = [];
    for (const s of rows) {
      if (isFinished(s)) continue;
      const d = byId.get(s.id);
      if (needDetail.some((n) => n.id === s.id) && !d) continue;
      for (const action of nextActions(d ?? s, user).actions) out.push({ submission: s, action });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, user, details.map((d) => d.dataUpdatedAt).join(',')]);

  const actionable = new Set(tasks.map((t) => t.submission.id));
  const finished = rows.filter(isFinished).length;
  return {
    rows, tasks, query: q, loading: q.isLoading || detailsLoading,
    counts: { action: tasks.length, running: rows.length - finished - actionable.size, done: finished, total: rows.length },
  };
}
