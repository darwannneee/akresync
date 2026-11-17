import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { DashboardStats } from '@akreditasi/shared';
import type { Assessor, AuditEventView, Institution, Program, SubmissionDetail, SubmissionSummary } from '../../api/types';

export const fetchSubmission = async (id: string): Promise<SubmissionDetail> => {
  const d = (await api.get<SubmissionDetail & { submission?: SubmissionDetail }>(`/submissions/${id}`)).data;
  return (d.submission ? { ...d.submission, ...d, submission: undefined } : d) as SubmissionDetail;
};

export const useSubmissions = () =>
  useQuery({ queryKey: ['submissions'], queryFn: async () => (await api.get<SubmissionSummary[]>('/submissions')).data ?? [] });

/** Memuat ulang berkala selama proses AI otomatis (periksa, indeks, analisis) belum selesai. */
export const useSubmission = (id: string) =>
  useQuery({
    queryKey: ['submission', id],
    queryFn: () => fetchSubmission(id),
    refetchInterval: (q) => {
      const p = q.state.data?.aiProgress;
      if (p?.enabled && ['checking', 'indexing', 'analyzing'].includes(p.phase)) return 5000;
      // Selama ada jejak audit yang belum tercatat permanen, muat ulang berkala agar langkah berikutnya muncul tanpa muat ulang manual (SSE bisa terputus).
      return (q.state.data?.audit ?? []).some((e) => e.status === 'pending') ? 6000 : false;
    },
  });

export const useSubmissionAudit = (id: string) =>
  useQuery({
    queryKey: ['audit', id],
    queryFn: async () => (await api.get<AuditEventView[]>(`/submissions/${id}/audit`)).data ?? [],
    refetchInterval: (q) => ((q.state.data ?? []).some((e) => e.status === 'pending') ? 6000 : false),
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
