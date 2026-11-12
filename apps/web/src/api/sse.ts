import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL, getAccessToken } from './client';
import { AUDIT_KIND_LABEL, RECORD_LABEL } from '../lib/labels';

export interface Notification { id: number; title: string; detail?: string; submissionId?: string; at: string; unread: boolean; tone: 'chain' | 'audit' | 'warn' }

/** Penyimpanan notifikasi ringan di memori, diisi dari SSE. */
let list: Notification[] = [];
let nid = 0;
const subs = new Set<() => void>();
const emit = () => { list = [...list]; subs.forEach((f) => f()); };
export const notifications = {
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  get: () => list,
  markAllRead: () => { list = list.map((n) => ({ ...n, unread: false })); emit(); },
  clear: () => { list = []; emit(); },
};
export const useNotifications = () => useSyncExternalStore(notifications.subscribe, notifications.get);

function toNotification(type: 'audit_status' | 'record_committed', d: Record<string, unknown>): Omit<Notification, 'id' | 'at' | 'unread'> {
  const submissionId = typeof d.submissionId === 'string' ? d.submissionId : undefined;
  if (type === 'record_committed') {
    const rt = typeof d.recordType === 'string' ? RECORD_LABEL[d.recordType] ?? undefined : undefined;
    return { title: 'Catatan resmi tercatat permanen', detail: rt, submissionId, tone: 'chain' };
  }
  const kind = typeof d.kind === 'string' ? AUDIT_KIND_LABEL[d.kind] ?? undefined : undefined;
  const status = d.status;
  if (status === 'failed') return { title: 'Pencatatan jejak audit belum berhasil', detail: kind, submissionId, tone: 'warn' };
  if (status === 'committed') return { title: 'Jejak audit tercatat permanen', detail: kind, submissionId, tone: 'audit' };
  return { title: 'Status pencatatan diperbarui', detail: kind, submissionId, tone: 'audit' };
}

/** Berlangganan SSE; invalidasi query pengajuan saat audit_status / record_committed dan isi notifikasi. */
export function useEventStream(enabled: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    const token = getAccessToken();
    if (!enabled || !token) return;
    const es = new EventSource(`${API_URL}/events/stream?token=${encodeURIComponent(token)}`);
    const handler = (type: 'audit_status' | 'record_committed') => (ev: MessageEvent<string>) => {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(ev.data) as Record<string, unknown>; } catch { /* abaikan */ }
      const submissionId = typeof data.submissionId === 'string' ? data.submissionId : undefined;
      if (submissionId) {
        void qc.invalidateQueries({ queryKey: ['submission', submissionId] });
        void qc.invalidateQueries({ queryKey: ['audit', submissionId] });
      }
      void qc.invalidateQueries({ queryKey: ['submissions'] });
      list = [{ id: ++nid, at: new Date().toISOString(), unread: true, ...toNotification(type, data) }, ...list].slice(0, 20);
      emit();
    };
    const a = handler('audit_status'); const r = handler('record_committed');
    es.addEventListener('audit_status', a as EventListener);
    es.addEventListener('record_committed', r as EventListener);
    return () => es.close();
  }, [enabled, qc]);
}
