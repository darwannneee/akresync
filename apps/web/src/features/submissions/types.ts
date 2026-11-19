import type { SubmissionDetail, User } from '../../api/types';
export type DetailTab = 'ringkasan' | 'dokumen' | 'asesmen' | 'riwayat' | 'ai';
/** Peran yang melihat tab Analisis AI; peran lain hanya melihat skor AI pada Ringkasan. */
export const AI_TAB_ROLES: readonly string[] = ['kea', 'asesor', 'majelis', 'sek_adm'];
export interface ActionProps { s: SubmissionDetail; user: User; goTab?: (t: DetailTab) => void }
