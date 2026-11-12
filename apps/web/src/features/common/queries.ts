import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Assessor, AuditEventView, Institution, Program, SubmissionDetail, SubmissionSummary } from '../../api/types';

export const useSubmissions = () =>
  useQuery({ queryKey: ['submissions'], queryFn: async () => (await api.get<SubmissionSummary[]>('/submissions')).data ?? [] });

export const useSubmission = (id: string) =>
  useQuery({
    queryKey: ['submission', id],
    queryFn: async () => {
      const d = (await api.get<SubmissionDetail & { submission?: SubmissionDetail }>(`/submissions/${id}`)).data;
      return (d.submission ? { ...d.submission, ...d, submission: undefined } : d) as SubmissionDetail;
    },
  });

export const useSubmissionAudit = (id: string) =>
  useQuery({ queryKey: ['audit', id], queryFn: async () => (await api.get<AuditEventView[]>(`/submissions/${id}/audit`)).data ?? [] });

export const useInstitutions = () =>
  useQuery({ queryKey: ['institutions'], queryFn: async () => (await api.get<Institution[]>('/institutions')).data ?? [] });
export const usePrograms = (institutionId: string) =>
  useQuery({ queryKey: ['programs', institutionId], enabled: !!institutionId, queryFn: async () => (await api.get<Program[]>(`/institutions/${institutionId}/programs`)).data ?? [] });
export const useAssessors = () =>
  useQuery({ queryKey: ['assessors'], queryFn: async () => (await api.get<Assessor[]>('/assessors')).data ?? [] });
