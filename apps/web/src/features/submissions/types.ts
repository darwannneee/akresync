import type { SubmissionDetail, User } from '../../api/types';
export type DetailTab = 'ringkasan' | 'dokumen' | 'penilaian' | 'jadwal' | 'catatan' | 'audit' | 'aktivitas';
export interface ActionProps { s: SubmissionDetail; user: User; goTab?: (t: DetailTab) => void }
