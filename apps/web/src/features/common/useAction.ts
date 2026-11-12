import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiEnvelope } from '@akreditasi/shared';
import { errorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';

/** Mutasi dengan toast tiga status (DB / audit / on-chain) dan invalidasi cache pengajuan. */
export function useAction<V, R = unknown>(
  fn: (v: V) => Promise<ApiEnvelope<R>>,
  opts: { title: string; submissionId?: string; onDone?: (env: ApiEnvelope<R>) => void },
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (env) => {
      toast.receipt(env, opts.title);
      if (opts.submissionId) {
        void qc.invalidateQueries({ queryKey: ['submission', opts.submissionId] });
        void qc.invalidateQueries({ queryKey: ['audit', opts.submissionId] });
      }
      void qc.invalidateQueries({ queryKey: ['submissions'] });
      opts.onDone?.(env);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

import { downloadFile } from '../../api/client';
export function useDownload() {
  const toast = useToast();
  return (path: string, name: string) => { downloadFile(path, name).catch((e) => toast.error(errorMessage(e))); };
}
