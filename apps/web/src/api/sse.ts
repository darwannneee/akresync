import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL, getAccessToken } from './client';

/** Berlangganan SSE; invalidasi query pengajuan saat audit_status / record_committed. */
export function useEventStream(enabled: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    const token = getAccessToken();
    if (!enabled || !token) return;
    const es = new EventSource(`${API_URL}/events/stream?token=${encodeURIComponent(token)}`);
    const handle = (ev: MessageEvent<string>) => {
      let submissionId: string | undefined;
      try { submissionId = (JSON.parse(ev.data) as { submissionId?: string }).submissionId; } catch { /* abaikan */ }
      if (submissionId) {
        void qc.invalidateQueries({ queryKey: ['submission', submissionId] });
        void qc.invalidateQueries({ queryKey: ['audit', submissionId] });
      }
      void qc.invalidateQueries({ queryKey: ['submissions'] });
    };
    es.addEventListener('audit_status', handle as EventListener);
    es.addEventListener('record_committed', handle as EventListener);
    return () => es.close();
  }, [enabled, qc]);
}
