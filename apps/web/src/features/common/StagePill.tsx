import type { SubmissionStage } from '@akreditasi/shared';
import { Badge, type Tone } from '../../components/ui';
import { STAGE_LABEL } from '../../lib/labels';

const TONE: Partial<Record<SubmissionStage, Tone>> = { admin_revision: 'warn', admin_rejected: 'danger', decided: 'gold', released: 'success', draft: 'neutral' };
export const StagePill = ({ stage }: { stage: SubmissionStage }) => <Badge tone={TONE[stage] ?? 'info'}>{STAGE_LABEL[stage] ?? stage}</Badge>;
