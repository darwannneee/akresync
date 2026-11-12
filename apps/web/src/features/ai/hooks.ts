import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiAnalysisDto, AiAnalysisList } from '@akreditasi/shared';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';

const ACTIVE = new Set(['queued', 'running']);

/** Riwayat analisis AI pengajuan; polling selama ada analisis antre/berjalan. */
export const useAiList = (submissionId: string, enabled = true) =>
  useQuery({
    queryKey: ['ai', submissionId],
    enabled,
    queryFn: async () => (await api.get<AiAnalysisList>(`/submissions/${submissionId}/ai-analyses`)).data,
    refetchInterval: (q) => {
      const l = q.state.data?.latest;
      return l && ACTIVE.has(l.status) ? 4000 : false;
    },
  });

/** Rincian satu analisis (dengan kutipan sumber). Analisis selesai tidak berubah lagi. */
export const useAiDetail = (analysisId?: string | null) =>
  useQuery({
    queryKey: ['ai-detail', analysisId],
    enabled: !!analysisId,
    staleTime: Infinity,
    queryFn: async () => (await api.get<AiAnalysisDto>(`/ai-analyses/${analysisId}`)).data,
  });

export function useRerunAi(submissionId: string, phase: 'AK' | 'AL' = 'AK') {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () => api.post(`/submissions/${submissionId}/ai-analyses`, { phase }),
    onSuccess: () => {
      toast.push({ kind: 'success', title: 'Analisis ulang diantrekan', lines: ['Hasil akan tampil otomatis setelah selesai.'] });
      void qc.invalidateQueries({ queryKey: ['ai', submissionId] });
      void qc.invalidateQueries({ queryKey: ['submission', submissionId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useReindex(submissionId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () => api.post(`/submissions/${submissionId}/reindex`),
    onSuccess: () => {
      toast.push({ kind: 'success', title: 'Pengindeksan ulang dimulai', lines: ['Dokumen LED dan LKPS diproses ulang di latar belakang.'] });
      void qc.invalidateQueries({ queryKey: ['ai', submissionId] });
      void qc.invalidateQueries({ queryKey: ['submission', submissionId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
