import type { ActionKey } from '../../lib/workflow';
import { Button } from '../../components/ui';
import type { ActionProps } from './types';
import { ComposeSubmission, UploadProof, UppsOfferResponse, UppsResponse } from '../upps/UppsActions';
import { AdminVerify, DecideSchedule, IssueCertificate, IssueInvoice, VerifyPayment } from '../sekretariat/SekretariatActions';
import { Consistency, FinalVerify, OfferForm, ReviewRejection, ScheduleForm } from '../kea/KeaActions';
import { AkScoring, AlAssessment, LeadResponse, RespondOffer } from '../asesor/AsesorActions';
import { DecisionForm } from '../majelis/MajelisActions';

/** Memetakan kunci tindakan (workflow.ts) ke formulir sebaris. */
export function ActionForm({ k, ...p }: ActionProps & { k: ActionKey }) {
  switch (k) {
    case 'compose_submission': return <ComposeSubmission {...p} />;
    case 'upload_proof': return <UploadProof {...p} />;
    case 'respond_offer_upps': return <UppsOfferResponse {...p} />;
    case 'upps_response': return <UppsResponse {...p} />;
    case 'admin_verify': return <AdminVerify {...p} />;
    case 'decide_schedule': return <DecideSchedule {...p} />;
    case 'issue_certificate': return <IssueCertificate {...p} />;
    case 'issue_invoice': return <IssueInvoice {...p} />;
    case 'verify_payment': return <VerifyPayment {...p} />;
    case 'offer': return <OfferForm {...p} />;
    case 'reoffer': return <OfferForm {...p} reoffer />;
    case 'review_rejection': return <ReviewRejection {...p} />;
    case 'consistency': return <Consistency {...p} />;
    case 'propose_schedule': return <ScheduleForm {...p} />;
    case 'final_verify': return <FinalVerify {...p} />;
    case 'respond_offer': return <RespondOffer {...p} />;
    case 'ak_scoring': return <AkScoring {...p} />;
    case 'ak_correction': return <Button onClick={() => p.goTab?.('catatan')}>Buka catatan resmi untuk melakukan koreksi</Button>;
    case 'al_assessment': return <AlAssessment {...p} />;
    case 'lead_response': return <LeadResponse {...p} />;
    case 'decision': return <DecisionForm {...p} />;
  }
}
