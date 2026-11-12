import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Badge, Button, Card } from '../../components/ui';
import { NotesForm, SingleUpload } from '../common/forms';
import { useAction } from '../common/useAction';
import { OfferResponseForm } from '../upps/UppsActions';
import type { ActionProps } from '../submissions/types';

export function AsesorActions({ s, user }: ActionProps) {
  const id = s.id;
  const offers = s.offers ?? [];
  const last = offers[offers.length - 1];
  const inPair = !!last && [last.assessor1Id, last.assessor2Id].includes(user.id);
  const isLead = !!last && last.leadAssessorId === user.id;
  const myResp = last ? (last.assessor1Id === user.id ? last.assessor1Response : last.assessor2Response) : null;
  const myAk = (s.assessments ?? []).find((a) => a.phase === 'AK' && a.assessorId === user.id);
  const myAl = (s.assessments ?? []).find((a) => a.phase === 'AL' && a.assessorId === user.id);
  const objection = (s.responses ?? []).some((r) => r.responseType === 'objection');
  const resolved = (s.responses ?? []).some((r) => r.responderRole === 'lead_assessor');
  const lead = useAction((body: string) => api.post(`/submissions/${id}/responses/lead`, { body }), { title: 'Respons ketua asesor dikirim', submissionId: id });
  const minutes = useAction((v: { file: File }) => { const f = new FormData(); f.append('file', v.file); return api.upload(`/submissions/${id}/al-minutes`, f); }, { title: 'Berita acara AL diunggah', submissionId: id });
  const hasMinutes = (s.documents ?? []).some((d) => d.docType === 'AL_MINUTES');

  return (
    <>
      {inPair && last?.status === 'offered' && !myResp && (
        <Card title="Penawaran penugasan"><OfferResponseForm offerId={last.id} submissionId={id} title="Tanggapan penugasan dikirim" /></Card>
      )}
      {inPair && ['effective', 'ak_partial', 'consistency_returned'].includes(s.akStatus) && (
        <Card title="Asesmen kecukupan (AK)">
          <p className="mb-3 text-sm text-slate-600">Status penilaian Anda: {myAk ? <Badge tone={myAk.status === 'submitted' ? 'success' : 'warn'}>{myAk.status === 'submitted' ? 'Telah dikirim' : 'Draf'}</Badge> : <Badge>Belum dimulai</Badge>}
            {s.akStatus === 'consistency_returned' && ' — dikembalikan KEA; lakukan penilaian ulang melalui koreksi catatan hasil asesmen.'}</p>
          {(myAk?.status !== 'submitted') && <Link to={`/asesor/pengajuan/${id}/penilaian/AK`}><Button>{myAk ? 'Lanjutkan penilaian AK' : 'Mulai penilaian AK'}</Button></Link>}
        </Card>
      )}
      {isLead && s.akStatus === 'consistency_approved' && s.stage !== 'al_submitted' && s.stage !== 'responses_completed' && !['final_verified', 'decided', 'released'].includes(s.stage) && (
        <Card title="Asesmen lapangan (AL) — ketua asesor">
          <p className="mb-3 text-sm text-slate-600">Unggah berita acara AL, kemudian isi skor AL dan kirim hasilnya.</p>
          <SingleUpload label="Berita acara AL" submitLabel={hasMinutes ? 'Unggah ulang berita acara' : 'Unggah berita acara'} pending={minutes.isPending} onSubmit={(file) => minutes.mutate({ file })} />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <Link to={`/asesor/pengajuan/${id}/penilaian/AL`}><Button disabled={!hasMinutes}>{myAl ? 'Lanjutkan penilaian AL' : 'Isi penilaian AL'}</Button></Link>
            {!hasMinutes && <span className="ml-2 text-xs text-slate-500">Berita acara wajib diunggah terlebih dahulu.</span>}
          </div>
        </Card>
      )}
      {isLead && objection && !resolved && (
        <Card title="Respons atas keberatan UPPS">
          <NotesForm label="Respons ketua asesor" required submitLabel="Kirim respons" pending={lead.isPending} onSubmit={(b) => lead.mutate(b)} />
        </Card>
      )}
    </>
  );
}
