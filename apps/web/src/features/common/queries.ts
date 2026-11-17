import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { DashboardStats } from '@akreditasi/shared';
import { auditPhase } from '../../lib/labels';
import type { Assessor, AuditEventView, Institution, Program, SubmissionDetail, SubmissionSummary } from '../../api/types';

export const fetchSubmission = async (id: string): Promise<SubmissionDetail> => {
  const d = (await api.get<SubmissionDetail & { submission?: SubmissionDetail }>(`/submissions/${id}`)).data;
  return (d.submission ? { ...d.submission, ...d, submission: undefined } : d) as SubmissionDetail;
};

export const useSubmissions = () =>
  useQuery({ queryKey: ['submissions'], queryFn: async () => (await api.get<SubmissionSummary[]>('/submissions')).data ?? [] });

/**
 * Jeda muat ulang selama ada jejak audit yang baru dicatat (fase `pending`, belum pernah gagal): 6 detik, naik bertahap
 * sampai 30 detik. Hanya peristiwa `pending` yang dipantau; bila yang tertunda sudah `retrying` (dicoba ulang otomatis) atau `failed`, polling dihentikan agar server
 * tidak dibebani; pembaruan berikutnya datang dari SSE atau muat ulang halaman.
 */
export function auditPollInterval(events: { status?: string | null; attempts?: number | null }[] | undefined, updates: number): number | false {
  if (!events?.length) return false;
  const phases = events.map(auditPhase);
  if (!phases.includes('pending')) return false;
  return Math.min(6000 * 1.5 ** Math.max(0, updates - 1), 30_000);
}

/** Memuat ulang berkala selama proses AI otomatis (periksa, indeks, analisis) belum selesai. */
export const useSubmission = (id: string) =>
  useQuery({
    queryKey: ['submission', id],
    queryFn: () => fetchSubmission(id),
    refetchInterval: (q) => {
      const p = q.state.data?.aiProgress;
      if (p?.enabled && ['checking', 'indexing', 'analyzing'].includes(p.phase)) return 5000;
      // Selama ada jejak audit yang belum tercatat permanen, muat ulang berkala agar langkah berikutnya muncul tanpa muat ulang manual (SSE bisa terputus).
      return auditPollInterval(q.state.data?.audit, q.state.dataUpdateCount);
    },
  });

export const useSubmissionAudit = (id: string) =>
  useQuery({
    queryKey: ['audit', id],
    queryFn: async () => (await api.get<AuditEventView[]>(`/submissions/${id}/audit`)).data ?? [],
    refetchInterval: (q) => auditPollInterval(q.state.data, q.state.dataUpdateCount),
  });

export const useInstitutions = () =>
  useQuery({ queryKey: ['institutions'], queryFn: async () => (await api.get<Institution[]>('/institutions')).data ?? [] });
export const usePrograms = (institutionId: string) =>
  useQuery({ queryKey: ['programs', institutionId], enabled: !!institutionId, queryFn: async () => (await api.get<Program[]>(`/institutions/${institutionId}/programs`)).data ?? [] });
export const useAssessors = () =>
  useQuery({ queryKey: ['assessors'], queryFn: async () => (await api.get<Assessor[]>('/assessors')).data ?? [] });

export interface LevelRef { id: number; code: string; label: string }
export interface ProgramNameRef { id: number; name: string }
export const useLevels = () =>
  useQuery({ queryKey: ['ref-levels'], staleTime: Infinity, queryFn: async () => (await api.get<LevelRef[]>('/ref/levels')).data ?? [] });
export const useProgramNames = () =>
  useQuery({ queryKey: ['ref-program-names'], staleTime: Infinity, queryFn: async () => (await api.get<ProgramNameRef[]>('/ref/program-names')).data ?? [] });

export const useDashboardStats = () =>
  useQuery({ queryKey: ['dashboard-stats'], staleTime: 30_000, queryFn: async () => (await api.get<DashboardStats>('/dashboard/stats')).data });
