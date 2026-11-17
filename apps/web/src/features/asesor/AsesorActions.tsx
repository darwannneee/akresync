import { ArrowRight } from 'lucide-react';
import { api } from '../../api/client';
import { Badge, ButtonLink, Notice, StepSection } from '../../components/ui';
import { NotesForm, SingleUpload } from '../common/forms';
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
      <p className="text-base">Status penilaian Bapak/Ibu: {mine ? <Badge tone={mine.status === 'submitted' && !rescore ? 'success' : 'warn'}>{rescore ? 'Dikembalikan, perlu dinilai ulang' : ASSESS_STATUS_LABEL[mine.status]}</Badge> : <Badge>Belum dimulai</Badge>}</p>
      {returned && <Notice tone="warn" title="Dikembalikan oleh KEA">{notes ?? 'Mohon periksa kembali penilaian Bapak/Ibu.'}</Notice>}
      <ButtonLink to={`/asesor/pengajuan/${s.id}/penilaian/AK`} icon={<ArrowRight size={16} />}>{rescore ? 'Nilai ulang' : mine ? 'Lanjutkan penilaian' : 'Mulai penilaian'}</ButtonLink>
    </div>
  );
}

export function AlAssessment({ s, user }: ActionProps) {
  const minutes = useAction((v: { file: File }) => { const f = new FormData(); f.append('file', v.file); return api.upload(`/submissions/${s.id}/al-minutes`, f); }, { title: 'Berita Acara telah diunggah', submissionId: s.id });
  const hasMinutes = (s.documents ?? []).some((d) => d.docType === 'AL_MINUTES');
  const myAl = (s.assessments ?? []).find((a) => a.phase === 'AL' && a.assessorId === user.id);
  return (
    <div className="space-y-6">
      <StepSection n={1} title="Isi penilaian Asesmen Lapangan" done={myAl?.status === 'submitted'} hint="Isi skor setiap butir pada seluruh kriteria. Penilaian dapat diisi sebelum Berita Acara diunggah.">
        <ButtonLink to={`/asesor/pengajuan/${s.id}/penilaian/AL`} icon={<ArrowRight size={16} />}>{myAl ? 'Lanjutkan penilaian' : 'Isi penilaian'}</ButtonLink>
      </StepSection>
      <StepSection n={2} title="Unggah Berita Acara Asesmen Lapangan" done={hasMinutes} hint="Berkas ditandatangani setelah kunjungan lapangan selesai. Wajib ada sebelum hasil diserahkan.">
        {hasMinutes && <div className="mb-3"><Notice tone="success">Berita Acara sudah terunggah. Unggah berkas baru bila ingin menggantinya.</Notice></div>}
        <SingleUpload label="Berita Acara" submitLabel={hasMinutes ? 'Unggah ulang Berita Acara' : 'Unggah Berita Acara'} pending={minutes.isPending} onSubmit={(file) => minutes.mutate({ file })} />
      </StepSection>
      <StepSection n={3} title="Serahkan hasil" hint={hasMinutes ? 'Dilakukan pada halaman penilaian setelah seluruh butir terisi.' : 'Terbuka setelah seluruh butir terisi dan Berita Acara diunggah.'} />
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
