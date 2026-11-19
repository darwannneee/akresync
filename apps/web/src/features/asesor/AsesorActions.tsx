import { ArrowRight } from 'lucide-react';
import { api } from '../../api/client';
import { ButtonLink, Notice, StatusDot } from '../../components/ui';
import { NotesForm } from '../common/forms';
import { useAction } from '../common/useAction';
import { OfferResponseForm } from '../upps/UppsActions';
import { ASSESS_STATUS_LABEL } from '../../lib/labels';
import { needsRescore } from '../../lib/workflow';
import type { ActionProps } from '../submissions/types';

export function RespondOffer({ s, user }: ActionProps) {
  const last = (s.offers ?? [])[(s.offers ?? []).length - 1];
  if (!last) return null;
  return (
    <div className="space-y-4">
      <Notice tone="info" title="Penugasan">Bapak/Ibu diusulkan sebagai asesor{last.leadAssessorId === user.id ? ' dan ketua asesor' : ''} untuk {s.programName ?? 'program studi ini'}.</Notice>
      <OfferResponseForm offerId={last.id} submissionId={s.id} title="Tanggapan penugasan telah dikirim" who={user.fullName} />
    </div>
  );
}

export function AkScoring({ s, user }: ActionProps) {
  const mine = (s.assessments ?? []).find((a) => a.phase === 'AK' && a.assessorId === user.id);
  const returned = s.akStatus === 'consistency_returned';
  const rescore = !!mine && needsRescore(s, mine);
  const notes = (s.offers ?? []).slice(-1)[0]?.consistencyNotes;
  return (
    <div className="space-y-4">
      <StatusDot tone={!mine ? 'gray' : rescore ? 'warn' : mine.status === 'submitted' ? 'ok' : 'navy'}>Penilaian Bapak/Ibu: {!mine ? 'belum dimulai' : rescore ? 'dikembalikan, perlu dinilai ulang' : ASSESS_STATUS_LABEL[mine.status]}</StatusDot>
      {returned && <Notice tone="warn" title="Dikembalikan oleh KEA">{notes ?? 'Mohon periksa kembali penilaian Bapak/Ibu.'}</Notice>}
      <ButtonLink to={`/asesor/pengajuan/${s.id}/penilaian/AK`} icon={<ArrowRight size={16} />}>{rescore ? 'Nilai ulang' : mine ? 'Lanjutkan penilaian' : 'Mulai penilaian'}</ButtonLink>
    </div>
  );
}

export function AlAssessment({ s, user }: ActionProps) {
  const hasMinutes = (s.documents ?? []).some((d) => d.docType === 'AL_MINUTES');
  const myAl = (s.assessments ?? []).find((a) => a.phase === 'AL' && a.assessorId === user.id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <StatusDot tone={myAl?.status === 'submitted' ? 'ok' : myAl ? 'navy' : 'gray'}>Penilaian: {myAl ? ASSESS_STATUS_LABEL[myAl.status] : 'belum dimulai'}</StatusDot>
        <StatusDot tone={hasMinutes ? 'ok' : 'gray'}>Berita Acara: {hasMinutes ? 'sudah diunggah' : 'belum diunggah'}</StatusDot>
      </div>
      <p className="text-[14px] text-faint">Skor, Berita Acara, dan penyerahan hasil dikerjakan pada halaman penilaian. Berita Acara wajib ada sebelum hasil diserahkan.</p>
      <ButtonLink to={`/asesor/pengajuan/${s.id}/penilaian/AL`} icon={<ArrowRight size={16} />}>{myAl ? 'Lanjutkan penilaian' : 'Buka penilaian lapangan'}</ButtonLink>
    </div>
  );
}

export function LeadResponse({ s }: ActionProps) {
  const lead = useAction((body: string) => api.post(`/submissions/${s.id}/responses/lead`, { body }), { title: 'Respons ketua asesor telah disampaikan', submissionId: s.id });
  const objection = (s.responses ?? []).find((r) => r.responseType === 'objection');
  return (
    <div className="space-y-4">
      {objection && <Notice tone="warn" title="Keberatan UPPS">{objection.body}</Notice>}
      <NotesForm label="Respons ketua asesor" required submitLabel="Sampaikan respons" pending={lead.isPending} onSubmit={(b) => lead.mutate(b)} />
    </div>
  );
}
