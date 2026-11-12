import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

export type RegStatus = 'pending_verification' | 'approved' | 'rejected';
export interface RegSummary {
  id: string; userId: string; uppsName: string; leaderName: string; picName: string; phone: string | null; status: RegStatus; reviewNote: string | null;
  reviewedAt: string | null; createdAt: string; email: string; institutionName: string; reviewedByName: string | null; programCount: number; hasPhoto: boolean;
}
export interface RegProgram { id: string; levelCode: string; levelLabel: string; programName: string; headName: string | null; location: string | null; lat: number | null; lng: number | null }
export interface RegFile { kind: 'photo' | 'sppa' | 'spsu'; label: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string }
export interface RegDetail extends RegSummary { programs: RegProgram[]; files: RegFile[] }

export const REG_STATUS_LABEL: Record<RegStatus, string> = { pending_verification: 'Menunggu verifikasi', approved: 'Disetujui', rejected: 'Ditolak' };

export const useUppsRegistrations = (enabled = true) =>
  useQuery({ queryKey: ['upps-registrations'], enabled, refetchInterval: 60_000, queryFn: async () => (await api.get<RegSummary[]>('/upps-registrations')).data ?? [] });
export const useUppsRegistration = (id: string) =>
  useQuery({ queryKey: ['upps-registration', id], queryFn: async () => (await api.get<RegDetail>(`/upps-registrations/${id}`)).data });
/** Jumlah pendaftaran UPPS yang menunggu verifikasi (hanya dimuat untuk Sekretariat Administrasi). */
export function usePendingRegistrationCount(enabled: boolean): number {
  const q = useUppsRegistrations(enabled);
  return (q.data ?? []).filter((r) => r.status === 'pending_verification').length;
}
