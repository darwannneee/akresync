import type { ActionKey } from '../../lib/workflow';
import type { ActionProps } from './types';
import { UploadProof, UppsOfferResponse, UppsResponse } from '../upps/UppsActions';
import { AdminVerify, DecideSchedule, IssueCertificate, IssueInvoice, VerifyPayment } from '../sekretariat/SekretariatActions';
import { FinalVerify, OfferForm, ReviewRejection, ScheduleForm } from '../kea/KeaActions';
import { LeadResponse, RespondOffer } from '../asesor/AsesorActions';
import { DecisionForm } from '../majelis/MajelisActions';

/**
 * Memetakan kunci tindakan (workflow.ts) ke formulir dalam panel. Tindakan dengan halaman kerja sendiri
 * (susun pengajuan, penilaian AK/AL, konsistensi AK) dibuka lewat tautan `to`, bukan di sini.
 */
export function ActionForm({ k, ...p }: ActionProps & { k: ActionKey }) {
  switch (k) {
    case 'compose_submission': case 'consistency': case 'ak_scoring': case 'al_assessment': return null;
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
    case 'propose_schedule': return <ScheduleForm {...p} />;
    case 'final_verify': return <FinalVerify {...p} />;
    case 'respond_offer': return <RespondOffer {...p} />;
    case 'lead_response': return <LeadResponse {...p} />;
    case 'decision': return <DecisionForm {...p} />;
  }
}
