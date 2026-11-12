import type { AdminVerificationPayload, AssessmentResultPayload, AssignmentResponsePayload, AssessorOfferPayload, FormalRecord } from '@akreditasi/shared';
import { q, q1, toDbKey, type Queryable } from '../db/pool.js';

export interface ProjectionInput {
  submissionId: string;
  actorUserId: string | null;
  record: FormalRecord;
}

async function touch(db: Queryable, submissionId: string, set: string, params: unknown[] = []) {
  await db.query(`UPDATE submissions SET ${set}, updated_at = now() WHERE id = $1`, [submissionId, ...params]);
}

/**
 * Proyeksi off-chain dari catatan formal yang sudah VALID. Murni fungsi dari (catatan, pelaku) sehingga
 * dapat dijalankan ulang oleh reconciler. Idempoten.
 */
export async function applyProjection(db: Queryable, input: ProjectionInput): Promise<void> {
  const { record, submissionId } = input;
  const isOriginal = record.version === 1;
  switch (record.recordType) {
    case 'SUBMISSION':
      await touch(db, submissionId, `stage = 'submitted', chain_stage = 'SUBMITTED'`);
      return;
    case 'ADMIN_VERIFICATION': {
      if (!isOriginal) return;
      const p = record.payload as AdminVerificationPayload;
      const map = {
        APPROVED: ['admin_verified', 'ADMIN_VERIFIED'],
        REVISION_REQUIRED: ['admin_revision', 'ADMIN_REVISION'],
        REJECTED: ['admin_rejected', 'ADMIN_REJECTED'],
      } as const;
      const [stage, chainStage] = map[p.result];
      await touch(db, submissionId, `stage = $2, chain_stage = $3`, [stage, chainStage]);
      return;
    }
    case 'ASSESSOR_OFFER': {
      if (!isOriginal) return;
      const p = record.payload as AssessorOfferPayload;
      await db.query(
        `UPDATE assessor_offers SET status = 'replaced' WHERE submission_id = $1 AND offer_no <> $2 AND status IN ('offered','rejected','effective')`,
        [submissionId, p.offerNo],
      );
      await db.query(
        `INSERT INTO assessor_offers (submission_id, offer_no, chain_seq, assessor1_id, assessor2_id, lead_assessor_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,'offered')
         ON CONFLICT (submission_id, offer_no) DO UPDATE SET chain_seq = EXCLUDED.chain_seq`,
        [submissionId, p.offerNo, record.seq, p.assessorUids[0], p.assessorUids[1], p.leadUid],
      );
      await touch(db, submissionId, `stage = 'in_assessment', ak_status = 'offered', chain_stage = 'ASSIGNMENT_OFFERED'`);
      return;
    }
    case 'ASSIGNMENT_RESPONSE': {
      const p = record.payload as AssignmentResponsePayload;
      const offer = await q1<any>(db, `SELECT * FROM assessor_offers WHERE submission_id=$1 AND chain_seq=$2`, [submissionId, p.offerSeq]);
      if (!offer) return;
      let col: string;
      if (p.responderRole === 'upps') col = 'upps_response';
      else col = offer.assessor1_id === input.actorUserId ? 'assessor1_response' : 'assessor2_response';
      await db.query(`UPDATE assessor_offers SET ${col} = $2, version = version + 1 WHERE id = $1`, [offer.id, p.response]);
      if (!isOriginal) return;
      const o = (await q1<any>(db, `SELECT * FROM assessor_offers WHERE id=$1`, [offer.id]))!;
      const responses = [o.assessor1_response, o.assessor2_response, o.upps_response];
      if (o.status === 'offered' && responses.includes('REJECT')) {
        await db.query(`UPDATE assessor_offers SET status = 'rejected' WHERE id = $1`, [o.id]);
        await touch(db, submissionId, `ak_status = 'offer_rejected', chain_stage = 'ASSIGNMENT_OFFERED'`);
      } else if (o.status === 'offered' && responses.every((r) => r === 'ACCEPT')) {
        await db.query(`UPDATE assessor_offers SET status = 'effective' WHERE id = $1`, [o.id]);
        await touch(db, submissionId, `ak_status = 'effective', chain_stage = 'ASSIGNMENT_EFFECTIVE'`);
      }
      return;
    }
    case 'ASSESSMENT_RESULT': {
      const p = record.payload as AssessmentResultPayload;
      const offer = await q1<any>(db, `SELECT * FROM assessor_offers WHERE submission_id=$1 AND chain_seq=$2`, [submissionId, p.offerSeq]);
      if (!offer || !input.actorUserId) return;
      await db.query(
        `INSERT INTO assessments (submission_id, offer_id, assessor_id, phase, status, total_score, score_summary_sha256, chain_record_key, submitted_at)
         VALUES ($1,$2,$3,$4,'submitted',$5,$6,$7,now())
         ON CONFLICT (offer_id, assessor_id, phase) DO UPDATE SET status='submitted', total_score=EXCLUDED.total_score,
           score_summary_sha256=EXCLUDED.score_summary_sha256, chain_record_key=EXCLUDED.chain_record_key,
           submitted_at=now(), updated_at=now(), version = assessments.version + 1`,
        [submissionId, offer.id, input.actorUserId, p.phase, p.totalScore, p.scoreSummarySha256, toDbKey(record.recordKey)],
      );
      if (p.phase === 'AL') {
        if (isOriginal) await touch(db, submissionId, `stage = 'al_submitted', chain_stage = 'AL_SUBMITTED'`);
        return;
      }
      const subs = await q<{ submitted_at: Date }>(db, `SELECT submitted_at FROM assessments WHERE offer_id=$1 AND phase='AK' AND status='submitted'`, [offer.id]);
      if (isOriginal) {
        const complete = subs.length >= 2;
        await touch(db, submissionId, `ak_status = $2, chain_stage = $3`, [complete ? 'ak_complete' : 'ak_partial', complete ? 'AK_COMPLETE' : 'AK_PARTIAL']);
      } else {
        const sub = await q1<{ ak_status: string }>(db, `SELECT ak_status FROM submissions WHERE id=$1`, [submissionId]);
        if (sub?.ak_status === 'consistency_returned' && offer.consistency_at) {
          const redone = subs.filter((s) => s.submitted_at > offer.consistency_at).length;
          if (redone >= 2) {
            await db.query(`UPDATE assessor_offers SET consistency_status = 'pending' WHERE id = $1`, [offer.id]);
            await touch(db, submissionId, `ak_status = 'ak_complete'`);
          }
        }
      }
      return;
    }
    case 'FINAL_VERIFICATION':
      if (isOriginal) await touch(db, submissionId, `stage = 'final_verified', chain_stage = 'FINAL_VERIFIED'`);
      return;
    case 'DECISION':
      if (isOriginal) await touch(db, submissionId, `stage = 'decided', chain_stage = 'DECIDED'`);
      return;
  }
}
