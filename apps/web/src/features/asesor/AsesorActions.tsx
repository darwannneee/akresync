import { api } from '../../api/client';
import { Notice } from '../../components/ui';
import { NotesForm } from '../common/forms';
import { useAction } from '../common/useAction';
import { OfferResponseForm } from '../upps/UppsActions';
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
