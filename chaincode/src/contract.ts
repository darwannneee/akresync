import { Contract, Context, Info, Transaction } from 'fabric-contract-api';
import {
  AUDIT_SERVICE_UID,
  CHAINCODE,
  GATE_EVENT_KINDS,
  INDIVIDUAL_RECORD_TYPES,
  NON_CORRECTABLE_RECORD_TYPES,
  canonicalJson,
  type AuditEvent,
  type AuditLedgerEntry,
  type ChainOfferState,
  type ChainStage,
  type ChainStageState,
  type FabricRole,
  type FormalRecord,
  type RecordActor,
  type RecordHistoryEntry,
  type RecordPayloadMap,
  type RecordType,
} from '@akreditasi/shared';
import { fail } from './errors';
import { getCaller, requireRole } from './identity';
import { KEY, auditIdxKey, auditKey, parseRecordKey, recordKey, reqKey, stageKey } from './keys';
import {
  collect,
  countAudit,
  decode,
  getJson,
  listAllRecords,
  listRecords,
  nextSeq,
  putJson,
  timestampToIso,
  txTimestampIso,
} from './ledger';
import { idString, validateAuditEvent, validatePayload } from './validation';

type Rec<T extends RecordType = RecordType> = FormalRecord<T>;

/** Field identitas per jenis catatan: tidak boleh berubah lewat CorrectRecord. */
const IMMUTABLE_FIELDS: { [K in RecordType]: (keyof RecordPayloadMap[K])[] } = {
  SUBMISSION: [],
  ADMIN_VERIFICATION: ['documentSetVersion', 'result'],
  ASSESSOR_OFFER: ['offerNo', 'assessorUids', 'leadUid', 'replacesOfferSeq'],
  ASSIGNMENT_RESPONSE: ['offerSeq', 'responderRole'],
  ASSESSMENT_RESULT: ['phase', 'offerSeq', 'documentSetVersion'],
  FINAL_VERIFICATION: ['alRecordKey', 'akRecordKeys'],
  DECISION: ['finalVerificationKey'],
};

@Info({ name: CHAINCODE.contract, title: CHAINCODE.contract, description: 'Catatan formal proses akreditasi' })
export class FormalRecordContract extends Contract {
  constructor() {
    super(CHAINCODE.contract);
  }

  // ---------------------------------------------------------------- helpers

  /** Validasi requestId + identitas + role, dan kembalikan hasil lama bila requestId sudah diproses (idempoten). */
  private async begin(
    ctx: Context,
    requestId: string,
    role: FabricRole,
    submissionId?: string,
  ): Promise<{ caller: RecordActor; existing: string | null }> {
    idString(requestId, 'requestId');
    if (submissionId !== undefined) idString(submissionId, 'submissionId');
    const caller = getCaller(ctx);
    requireRole(caller, role);
    const existing = await this.findByRequest(ctx, requestId);
    if (existing && submissionId !== undefined && existing.submissionId !== submissionId) {
      fail('INVALID_ARGUMENT', 'requestId sudah dipakai untuk pengajuan lain');
    }
    return { caller, existing: existing ? canonicalJson(existing) : null };
  }

  private async findByRequest(ctx: Context, requestId: string): Promise<Rec | null> {
    const bytes = await ctx.stub.getState(reqKey(ctx.stub, requestId));
    if (!bytes || bytes.length === 0) return null;
    const rec = await getJson<Rec>(ctx.stub, decode(bytes));
    if (!rec) fail('NOT_FOUND', 'REQ menunjuk catatan yang tidak ada');
    return rec;
  }

  private async getStageState(ctx: Context, submissionId: string): Promise<ChainStageState | null> {
    return getJson<ChainStageState>(ctx.stub, stageKey(ctx.stub, submissionId));
  }

  private async requireStage(ctx: Context, submissionId: string, allowed: ChainStage[]): Promise<ChainStageState> {
    const st = await this.getStageState(ctx, submissionId);
    if (!st) return fail('PRECONDITION_FAILED', 'pengajuan belum ada');
    if (!allowed.includes(st.stage)) {
      return fail('PRECONDITION_FAILED', `tahap ${st.stage} tidak mengizinkan aksi ini (diharapkan: ${allowed.join(' / ')})`);
    }
    return st;
  }

  private async putStage(ctx: Context, st: ChainStageState): Promise<void> {
    st.updatedTxId = ctx.stub.getTxID();
    await putJson(ctx.stub, stageKey(ctx.stub, st.submissionId), st);
  }

  private async requireAudit(ctx: Context, submissionId: string, kind: string, minCount = 1): Promise<void> {
    const n = await countAudit(ctx.stub, submissionId, kind);
    if (n < minCount) fail('PRECONDITION_FAILED', `bukti audit ${kind} belum tercatat untuk pengajuan ini`);
  }

  /** Tulis catatan baru + REQ + event. */
  private async commitRecord<T extends RecordType>(
    ctx: Context,
    caller: RecordActor,
    type: T,
    submissionId: string,
    payload: RecordPayloadMap[T],
    requestId: string,
  ): Promise<Rec<T>> {
    const seq = await nextSeq(ctx.stub, submissionId);
    const key = recordKey(ctx.stub, type, submissionId, seq);
    const record: Rec<T> = {
      docType: 'formalRecord',
      recordKey: key,
      recordType: type,
      submissionId,
      seq,
      version: 1,
      actor: caller,
      lastWriter: caller,
      payload,
      requestId,
      txId: ctx.stub.getTxID(),
      timestamp: txTimestampIso(ctx.stub),
      prevTxId: null,
      correction: null,
    };
    await putJson(ctx.stub, key, record);
    await ctx.stub.putState(reqKey(ctx.stub, requestId), Buffer.from(key, 'utf8'));
    this.emitCommitted(ctx, record);
    return record;
  }

  private emitCommitted(ctx: Context, r: Rec): void {
    ctx.stub.setEvent(
      'RecordCommitted',
      Buffer.from(canonicalJson({ recordKey: r.recordKey, submissionId: r.submissionId, recordType: r.recordType, version: r.version }), 'utf8'),
    );
  }

  private async loadRecord(ctx: Context, key: string): Promise<Rec> {
    parseRecordKey(ctx.stub, key);
    const rec = await getJson<Rec>(ctx.stub, key);
    return rec ?? fail('NOT_FOUND', `catatan tidak ditemukan: ${key.replace(/\u0000/g, '~')}`);
  }

  // ---------------------------------------------------------------- writes

  @Transaction()
  async CreateSubmission(ctx: Context, requestId: string, submissionId: string, payloadJson: string): Promise<string> {
    const { caller, existing } = await this.begin(ctx, requestId, 'upps', submissionId);
    if (existing) return existing;
    const payload = validatePayload('SUBMISSION', payloadJson);
    const st = await this.getStageState(ctx, submissionId);
    let next: ChainStageState;
    if (st === null) {
      next = { submissionId, stage: 'SUBMITTED', ownerUid: caller.uid, documentSetVersion: payload.documentSetVersion, activeOffer: null, updatedTxId: '' };
    } else if (st.stage === 'ADMIN_REVISION') {
      if (st.ownerUid !== caller.uid) fail('FORBIDDEN', 'hanya pemilik pengajuan yang boleh mengirim revisi');
      if (payload.documentSetVersion <= st.documentSetVersion) {
        fail('PRECONDITION_FAILED', `documentSetVersion revisi harus > ${st.documentSetVersion}`);
      }
      next = { ...st, stage: 'SUBMITTED', documentSetVersion: payload.documentSetVersion, activeOffer: null };
    } else {
      return fail('PRECONDITION_FAILED', `pengajuan sudah ada pada tahap ${st.stage}`);
    }
    const rec = await this.commitRecord(ctx, caller, 'SUBMISSION', submissionId, payload, requestId);
    await this.putStage(ctx, next);
    return canonicalJson(rec);
  }

  @Transaction()
  async RecordAdminVerification(ctx: Context, requestId: string, submissionId: string, payloadJson: string): Promise<string> {
    const { caller, existing } = await this.begin(ctx, requestId, 'sek_adm', submissionId);
    if (existing) return existing;
    const payload = validatePayload('ADMIN_VERIFICATION', payloadJson);
    const st = await this.requireStage(ctx, submissionId, ['SUBMITTED']);
    if (payload.documentSetVersion !== st.documentSetVersion) {
      fail('PRECONDITION_FAILED', `documentSetVersion ${payload.documentSetVersion} bukan versi pengajuan terakhir (${st.documentSetVersion})`);
    }
    const rec = await this.commitRecord(ctx, caller, 'ADMIN_VERIFICATION', submissionId, payload, requestId);
    const stage: ChainStage = payload.result === 'APPROVED' ? 'ADMIN_VERIFIED' : payload.result === 'REVISION_REQUIRED' ? 'ADMIN_REVISION' : 'ADMIN_REJECTED';
    await this.putStage(ctx, { ...st, stage });
    return canonicalJson(rec);
  }

  @Transaction()
  async OfferAssessorPair(ctx: Context, requestId: string, submissionId: string, payloadJson: string): Promise<string> {
    const { caller, existing } = await this.begin(ctx, requestId, 'kea', submissionId);
    if (existing) return existing;
    const payload = validatePayload('ASSESSOR_OFFER', payloadJson);
    const st = await this.requireStage(ctx, submissionId, ['ADMIN_VERIFIED', 'ASSIGNMENT_OFFERED']);
    if (st.stage === 'ADMIN_VERIFIED') {
      await this.requireAudit(ctx, submissionId, GATE_EVENT_KINDS.OfferAssessorPair);
      if (payload.replacesOfferSeq !== null) fail('INVALID_ARGUMENT', 'penawaran pertama tidak boleh memiliki replacesOfferSeq');
    } else {
      const active = st.activeOffer;
      if (!active || !active.rejected) fail('PRECONDITION_FAILED', 'penawaran aktif belum ditolak; penawaran ulang tidak diizinkan');
      const offers = await listRecords(ctx.stub, 'ASSESSOR_OFFER', submissionId);
      // setiap penolakan memerlukan satu bukti AssignmentRejectionReviewed
      await this.requireAudit(ctx, submissionId, GATE_EVENT_KINDS.ReOfferAssessorPair, offers.length);
      if (payload.replacesOfferSeq !== null && payload.replacesOfferSeq !== active!.offerSeq) {
        fail('INVALID_ARGUMENT', `replacesOfferSeq harus ${active!.offerSeq}`);
      }
      payload.replacesOfferSeq = active!.offerSeq;
      const prev = offers.find((o) => o.seq === active!.offerSeq) as Rec<'ASSESSOR_OFFER'> | undefined;
      if (prev && payload.offerNo <= prev.payload.offerNo) fail('INVALID_ARGUMENT', `offerNo harus > ${prev.payload.offerNo}`);
    }
    const rec = await this.commitRecord(ctx, caller, 'ASSESSOR_OFFER', submissionId, payload, requestId);
    const offer: ChainOfferState = {
      offerSeq: rec.seq,
      assessorUids: payload.assessorUids,
      leadUid: payload.leadUid,
      responses: {},
      rejected: false,
      akSubmittedBy: [],
    };
    await this.putStage(ctx, { ...st, stage: 'ASSIGNMENT_OFFERED', activeOffer: offer });
    return canonicalJson(rec);
  }

  @Transaction()
  async RespondAssignment(ctx: Context, requestId: string, submissionId: string, payloadJson: string): Promise<string> {
    idString(requestId, 'requestId');
    const caller = getCaller(ctx);
    if (caller.role !== 'asesor' && caller.role !== 'upps') fail('FORBIDDEN', 'hanya asesor atau UPPS yang dapat menanggapi penugasan');
    const { existing } = await this.begin(ctx, requestId, caller.role, submissionId);
    if (existing) return existing;
    const payload = validatePayload('ASSIGNMENT_RESPONSE', payloadJson);
    if (payload.responderRole !== caller.role) fail('FORBIDDEN', 'responderRole tidak sesuai role pemanggil');
    const st = await this.requireStage(ctx, submissionId, ['ASSIGNMENT_OFFERED']);
    const offer = st.activeOffer!;
    if (payload.offerSeq !== offer.offerSeq) fail('PRECONDITION_FAILED', `offerSeq bukan penawaran aktif (${offer.offerSeq})`);
    if (caller.role === 'asesor' && !offer.assessorUids.includes(caller.uid)) fail('FORBIDDEN', 'asesor tidak termasuk pasangan yang ditawari');
    if (caller.role === 'upps' && caller.uid !== st.ownerUid) fail('FORBIDDEN', 'hanya UPPS pemilik pengajuan yang dapat menanggapi');
    if (Object.prototype.hasOwnProperty.call(offer.responses, caller.uid)) fail('PRECONDITION_FAILED', 'responden sudah menanggapi penawaran ini');

    const rec = await this.commitRecord(ctx, caller, 'ASSIGNMENT_RESPONSE', submissionId, payload, requestId);
    offer.responses[caller.uid] = payload.response;
    if (payload.response === 'REJECT') offer.rejected = true;
    let stage: ChainStage = st.stage;
    if (!offer.rejected && this.allAccepted(st.ownerUid, offer)) stage = 'ASSIGNMENT_EFFECTIVE';
    await this.putStage(ctx, { ...st, stage, activeOffer: offer });
    return canonicalJson(rec);
  }

  private allAccepted(ownerUid: string, offer: ChainOfferState): boolean {
    return [...offer.assessorUids, ownerUid].every((u) => offer.responses[u] === 'ACCEPT');
  }

  @Transaction()
  async SubmitAssessmentResult(ctx: Context, requestId: string, submissionId: string, payloadJson: string): Promise<string> {
    const { caller, existing } = await this.begin(ctx, requestId, 'asesor', submissionId);
    if (existing) return existing;
    const payload = validatePayload('ASSESSMENT_RESULT', payloadJson);
    const st = await this.requireStage(
      ctx,
      submissionId,
      payload.phase === 'AK' ? ['ASSIGNMENT_EFFECTIVE', 'AK_PARTIAL'] : ['AK_COMPLETE'],
    );
    const offer = st.activeOffer!;
    if (payload.offerSeq !== offer.offerSeq) fail('PRECONDITION_FAILED', `offerSeq bukan penawaran aktif (${offer.offerSeq})`);
    if (payload.documentSetVersion !== st.documentSetVersion) {
      fail('PRECONDITION_FAILED', `documentSetVersion harus ${st.documentSetVersion}`);
    }
    let stage: ChainStage;
    if (payload.phase === 'AK') {
      if (!offer.assessorUids.includes(caller.uid)) fail('FORBIDDEN', 'asesor tidak termasuk pasangan aktif');
      if (offer.akSubmittedBy.includes(caller.uid)) {
        fail('PRECONDITION_FAILED', 'asesor sudah mengirim AK; penilaian ulang lewat CorrectRecord');
      }
      offer.akSubmittedBy.push(caller.uid);
      stage = offer.akSubmittedBy.length >= 2 ? 'AK_COMPLETE' : 'AK_PARTIAL';
    } else {
      if (caller.uid !== offer.leadUid) fail('FORBIDDEN', 'AL hanya boleh dikirim oleh ketua asesor');
      for (const kind of GATE_EVENT_KINDS.SubmitAssessmentResultAL) await this.requireAudit(ctx, submissionId, kind);
      stage = 'AL_SUBMITTED';
    }
    const rec = await this.commitRecord(ctx, caller, 'ASSESSMENT_RESULT', submissionId, payload, requestId);
    await this.putStage(ctx, { ...st, stage, activeOffer: offer });
    return canonicalJson(rec);
  }

  @Transaction()
  async RecordFinalVerification(ctx: Context, requestId: string, submissionId: string, payloadJson: string): Promise<string> {
    const { caller, existing } = await this.begin(ctx, requestId, 'kea', submissionId);
    if (existing) return existing;
    const payload = validatePayload('FINAL_VERIFICATION', payloadJson);
    const st = await this.requireStage(ctx, submissionId, ['AL_SUBMITTED']);
    await this.requireAudit(ctx, submissionId, GATE_EVENT_KINDS.RecordFinalVerification);
    const offer = st.activeOffer!;

    const al = await this.loadRecord(ctx, payload.alRecordKey);
    if (al.submissionId !== submissionId || al.recordType !== 'ASSESSMENT_RESULT' || (al as Rec<'ASSESSMENT_RESULT'>).payload.phase !== 'AL') {
      fail('INVALID_ARGUMENT', 'alRecordKey bukan catatan AL pengajuan ini');
    }
    const aks: Rec<'ASSESSMENT_RESULT'>[] = [];
    for (const k of payload.akRecordKeys) {
      const r = (await this.loadRecord(ctx, k)) as Rec<'ASSESSMENT_RESULT'>;
      if (r.submissionId !== submissionId || r.recordType !== 'ASSESSMENT_RESULT' || r.payload.phase !== 'AK' || r.payload.offerSeq !== offer.offerSeq) {
        fail('INVALID_ARGUMENT', `akRecordKeys bukan catatan AK penawaran aktif pengajuan ini`);
      }
      aks.push(r);
    }
    const uids = new Set(aks.map((r) => r.actor.uid));
    if (uids.size !== 2 || !offer.assessorUids.every((u) => uids.has(u))) fail('INVALID_ARGUMENT', 'akRecordKeys harus mewakili kedua asesor pasangan aktif');

    const rec = await this.commitRecord(ctx, caller, 'FINAL_VERIFICATION', submissionId, payload, requestId);
    await this.putStage(ctx, { ...st, stage: 'FINAL_VERIFIED' });
    return canonicalJson(rec);
  }

  @Transaction()
  async SetDecision(ctx: Context, requestId: string, submissionId: string, payloadJson: string): Promise<string> {
    const { caller, existing } = await this.begin(ctx, requestId, 'majelis', submissionId);
    if (existing) return existing;
    const payload = validatePayload('DECISION', payloadJson);
    const st = await this.requireStage(ctx, submissionId, ['FINAL_VERIFIED']);
    const finals = await listRecords(ctx.stub, 'FINAL_VERIFICATION', submissionId);
    const fv = finals[finals.length - 1];
    if (!fv || fv.recordKey !== payload.finalVerificationKey) fail('INVALID_ARGUMENT', 'finalVerificationKey bukan verifikasi akhir pengajuan ini');
    const rec = await this.commitRecord(ctx, caller, 'DECISION', submissionId, payload, requestId);
    await this.putStage(ctx, { ...st, stage: 'DECIDED' });
    return canonicalJson(rec);
  }

  @Transaction()
  async CorrectRecord(
    ctx: Context,
    requestId: string,
    recordKeyArg: string,
    payloadJson: string,
    reason: string,
    evidenceRef: string,
    expectedVersion: string,
  ): Promise<string> {
    idString(requestId, 'requestId');
    const caller = getCaller(ctx);
    const prior = await this.findByRequest(ctx, requestId);
    if (prior) {
      if (prior.recordKey !== recordKeyArg) fail('INVALID_ARGUMENT', 'requestId sudah dipakai untuk catatan lain');
      return canonicalJson(prior);
    }
    const parsed = parseRecordKey(ctx.stub, recordKeyArg);
    const old = await this.loadRecord(ctx, recordKeyArg);
    const type = old.recordType;

    if ((NON_CORRECTABLE_RECORD_TYPES as readonly string[]).includes(type)) {
      fail('PRECONDITION_FAILED', `${type} tidak dapat dikoreksi; revisi lewat CreateSubmission saat ADMIN_REVISION`);
    }
    if (type === 'ASSESSOR_OFFER') fail('PRECONDITION_FAILED', 'ASSESSOR_OFFER tidak dapat dikoreksi; gunakan penawaran ulang');
    if (caller.role !== old.actor.role || caller.mspId !== old.actor.mspId) fail('FORBIDDEN', 'hanya role pencatat awal yang boleh mengoreksi');
    if ((INDIVIDUAL_RECORD_TYPES as readonly string[]).includes(type) && caller.uid !== old.actor.uid) {
      fail('FORBIDDEN', 'hanya pencatat awal (uid sama) yang boleh mengoreksi catatan ini');
    }
    str1(reason, 'reason');
    str1(evidenceRef, 'evidenceRef');
    if (!/^[1-9]\d*$/.test(String(expectedVersion))) fail('INVALID_ARGUMENT', 'expectedVersion harus bilangan bulat positif');
    if (Number(expectedVersion) !== old.version) fail('VERSION_CONFLICT', `versi sekarang ${old.version}, diharapkan ${expectedVersion}`);

    const payload = validatePayload(type, payloadJson) as unknown as Record<string, unknown>;
    const oldPayload = old.payload as unknown as Record<string, unknown>;
    for (const f of IMMUTABLE_FIELDS[type] as string[]) {
      if (canonicalJson(payload[f]) !== canonicalJson(oldPayload[f])) fail('INVALID_ARGUMENT', `field identitas ${f} tidak boleh diubah`);
    }

    let stageUpdate: ChainStageState | null = null;
    if (type === 'ASSIGNMENT_RESPONSE') {
      const st = await this.requireStage(ctx, parsed.submissionId, ['ASSIGNMENT_OFFERED']);
      const offer = st.activeOffer!;
      if ((old.payload as Rec<'ASSIGNMENT_RESPONSE'>['payload']).offerSeq !== offer.offerSeq) {
        fail('PRECONDITION_FAILED', 'penawaran sudah digantikan; tanggapan lama tidak dapat dikoreksi');
      }
      offer.responses[old.actor.uid] = (payload as unknown as Rec<'ASSIGNMENT_RESPONSE'>['payload']).response;
      offer.rejected = Object.values(offer.responses).includes('REJECT');
      if (!offer.rejected && this.allAccepted(st.ownerUid, offer)) {
        fail('PRECONDITION_FAILED', 'koreksi tidak boleh menjadikan penugasan efektif; gunakan penawaran ulang');
      }
      stageUpdate = { ...st, activeOffer: offer };
    }

    const rec: Rec = {
      ...old,
      version: old.version + 1,
      lastWriter: caller,
      payload: payload as never,
      requestId,
      txId: ctx.stub.getTxID(),
      timestamp: txTimestampIso(ctx.stub),
      prevTxId: old.txId,
      correction: { reason, evidenceRef },
    };
    await putJson(ctx.stub, rec.recordKey, rec);
    await ctx.stub.putState(reqKey(ctx.stub, requestId), Buffer.from(rec.recordKey, 'utf8'));
    if (stageUpdate) await this.putStage(ctx, stageUpdate);
    this.emitCommitted(ctx, rec);
    return canonicalJson(rec);
  }

  @Transaction()
  async RecordAudit(ctx: Context, eventJson: string): Promise<string> {
    const caller = getCaller(ctx);
    requireRole(caller, 'audit');
    if (caller.uid !== AUDIT_SERVICE_UID) fail('FORBIDDEN', 'hanya identitas layanan audit yang boleh mencatat audit');
    const event: AuditEvent = validateAuditEvent(eventJson);
    const key = auditKey(ctx.stub, event.eventId);
    const prior = await getJson<AuditLedgerEntry>(ctx.stub, key);
    if (prior) {
      if (prior.payloadSha256 !== event.payloadSha256) {
        fail('AUDIT_CONFLICT', `eventId ${event.eventId} sudah tercatat dengan payloadSha256 berbeda`);
      }
      return canonicalJson(prior);
    }
    const entry: AuditLedgerEntry = { ...event, docType: 'auditEvent', txId: ctx.stub.getTxID(), recordedAt: txTimestampIso(ctx.stub) };
    await putJson(ctx.stub, key, entry);
    if (event.submissionId !== null) {
      await ctx.stub.putState(auditIdxKey(ctx.stub, event.submissionId, event.kind, event.eventId), Buffer.from('1', 'utf8'));
    }
    ctx.stub.setEvent(
      'AuditRecorded',
      Buffer.from(canonicalJson({ eventId: event.eventId, submissionId: event.submissionId, kind: event.kind }), 'utf8'),
    );
    return canonicalJson(entry);
  }

  // ---------------------------------------------------------------- reads

  @Transaction(false)
  async GetRecord(ctx: Context, recordKeyArg: string): Promise<string> {
    getCaller(ctx);
    return canonicalJson(await this.loadRecord(ctx, recordKeyArg));
  }

  /** Tambahan di luar kontrak: cari catatan lewat requestId (untuk reconciler). */
  @Transaction(false)
  async GetRecordByRequest(ctx: Context, requestId: string): Promise<string> {
    getCaller(ctx);
    idString(requestId, 'requestId');
    const rec = await this.findByRequest(ctx, requestId);
    return canonicalJson(rec ?? fail('NOT_FOUND', 'requestId tidak ditemukan'));
  }

  @Transaction(false)
  async GetRecordHistory(ctx: Context, recordKeyArg: string): Promise<string> {
    getCaller(ctx);
    parseRecordKey(ctx.stub, recordKeyArg);
    const items = await collect(await ctx.stub.getHistoryForKey(recordKeyArg));
    const out: RecordHistoryEntry[] = items.map((h) => ({
      txId: h.txId,
      timestamp: timestampToIso(h.timestamp as { seconds?: unknown; nanos?: number }),
      isDelete: Boolean(h.isDelete),
      value: h.isDelete || !h.value || h.value.length === 0 ? null : (JSON.parse(decode(h.value as Uint8Array)) as Rec),
    }));
    return canonicalJson(out);
  }

  @Transaction(false)
  async GetSubmissionRecords(ctx: Context, submissionId: string): Promise<string> {
    getCaller(ctx);
    idString(submissionId, 'submissionId');
    return canonicalJson(await listAllRecords(ctx.stub, submissionId));
  }

  @Transaction(false)
  async GetStage(ctx: Context, submissionId: string): Promise<string> {
    getCaller(ctx);
    idString(submissionId, 'submissionId');
    const st = await this.getStageState(ctx, submissionId);
    return canonicalJson(st ?? fail('NOT_FOUND', 'pengajuan belum ada'));
  }

  @Transaction(false)
  async GetAuditEvents(ctx: Context, submissionId: string): Promise<string> {
    getCaller(ctx);
    idString(submissionId, 'submissionId');
    const idx = await collect(await ctx.stub.getStateByPartialCompositeKey(KEY.AUDITIDX, [submissionId]));
    const events: AuditLedgerEntry[] = [];
    for (const i of idx) {
      const eventId = ctx.stub.splitCompositeKey(i.key).attributes[2]!;
      const e = await getJson<AuditLedgerEntry>(ctx.stub, auditKey(ctx.stub, eventId));
      if (e) events.push(e);
    }
    events.sort((a, b) => (a.occurredAt === b.occurredAt ? (a.eventId < b.eventId ? -1 : 1) : a.occurredAt < b.occurredAt ? -1 : 1));
    return canonicalJson(events);
  }
}

function str1(v: unknown, name: string): void {
  if (typeof v !== 'string' || v.trim().length === 0) fail('INVALID_ARGUMENT', `${name} wajib diisi`);
}

