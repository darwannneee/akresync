import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../../api/client';
import { Badge, Button, Notice, StepSection } from '../../components/ui';
import { NotesForm, SingleUpload } from '../common/forms';
import { useAction } from '../common/useAction';
import { OfferResponseForm } from '../upps/UppsActions';
import { ASSESS_STATUS_LABEL } from '../../lib/labels';
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
  return (
    <div className="space-y-4">
      <p className="text-base">Status penilaian Bapak/Ibu: {mine ? <Badge tone={mine.status === 'submitted' ? 'success' : 'warn'}>{ASSESS_STATUS_LABEL[mine.status]}</Badge> : <Badge>Belum dimulai</Badge>}</p>
      {s.akStatus === 'consistency_returned' && <Notice tone="warn" title="Dikembalikan oleh KEA">{(s.offers ?? []).slice(-1)[0]?.consistencyNotes ?? 'Mohon periksa kembali penilaian Bapak/Ibu.'}</Notice>}
      <Link to={`/asesor/pengajuan/${s.id}/penilaian/AK`}><Button icon={<ArrowRight size={16} />}>{mine ? 'Lanjutkan penilaian' : 'Mulai penilaian'}</Button></Link>
    </div>
  );
}

export function AlAssessment({ s, user }: ActionProps) {
  const minutes = useAction((v: { file: File }) => { const f = new FormData(); f.append('file', v.file); return api.upload(`/submissions/${s.id}/al-minutes`, f); }, { title: 'Berita Acara telah diunggah', submissionId: s.id });
  const hasMinutes = (s.documents ?? []).some((d) => d.docType === 'AL_MINUTES');
  const myAl = (s.assessments ?? []).find((a) => a.phase === 'AL' && a.assessorId === user.id);
  return (
    <div className="space-y-6">
      <StepSection n={1} title="Unggah Berita Acara Asesmen Lapangan" done={hasMinutes} hint="Berkas ditandatangani setelah kunjungan lapangan selesai.">
        {hasMinutes && <div className="mb-3"><Notice tone="success">Berita Acara sudah terunggah. Unggah berkas baru bila ingin menggantinya.</Notice></div>}
        <SingleUpload label="Berita Acara" submitLabel={hasMinutes ? 'Unggah ulang Berita Acara' : 'Unggah Berita Acara'} pending={minutes.isPending} onSubmit={(file) => minutes.mutate({ file })} />
      </StepSection>
      <StepSection n={2} title="Isi penilaian Asesmen Lapangan" hint={hasMinutes ? 'Isi skor setiap butir pada sembilan kriteria.' : 'Terbuka setelah Berita Acara diunggah.'}>
        {hasMinutes ? <Link to={`/asesor/pengajuan/${s.id}/penilaian/AL`}><Button icon={<ArrowRight size={16} />}>{myAl ? 'Lanjutkan penilaian' : 'Isi penilaian'}</Button></Link> : <Button disabled>Isi penilaian</Button>}
      </StepSection>
      <StepSection n={3} title="Serahkan hasil" hint="Dilakukan pada halaman penilaian setelah seluruh butir terisi." />
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
