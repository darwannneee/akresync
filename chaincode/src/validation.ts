import {
  ACCREDITATION_RANKS,
  AGGREGATE_TYPES,
  APP_ROLES,
  MAX_TOTAL_SCORE,
  AUDIT_EVENT_KINDS,
  DOCUMENT_TYPES,
  SHA256_HEX,
  type AdminVerificationPayload,
  type AssessmentResultPayload,
  type AssessorOfferPayload,
  type AssignmentResponsePayload,
  type AuditEvent,
  type DecisionPayload,
  type DocumentRef,
  type FinalVerificationPayload,
  type RecordPayloadMap,
  type RecordType,
  type SubmissionPayload,
} from '@akreditasi/shared';
import { fail } from './errors';

type Obj = Record<string, unknown>;

const bad = (msg: string): never => fail('INVALID_ARGUMENT', msg);

export function parseObject(json: string, name: string): Obj {
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return bad(`${name}: bukan JSON yang valid`);
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return bad(`${name}: harus berupa objek JSON`);
  return v as Obj;
}

/** Semua kunci wajib hadir (kecuali yang opsional-nullable) dan tidak boleh ada kunci tak dikenal. */
function checkKeys(o: Obj, name: string, required: string[], nullable: string[] = []): void {
  const allowed = new Set([...required, ...nullable]);
  for (const k of Object.keys(o)) if (!allowed.has(k)) bad(`${name}: kunci tidak dikenal "${k}"`);
  for (const k of required) if (!(k in o)) bad(`${name}: kunci "${k}" wajib`);
}

const FORBIDDEN_KEY_CHARS = /[\u0000\u{10FFFF}]/u;

/** Identifier yang dipakai di kunci komposit (requestId, submissionId, uid, eventId). */
export function idString(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.trim().length === 0) return bad(`${name}: harus string tidak kosong`);
  if (v.length > 200) return bad(`${name}: terlalu panjang`);
  if (FORBIDDEN_KEY_CHARS.test(v) || v === '__proto__') return bad(`${name}: mengandung karakter terlarang`);
  return v;
}

function str(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.trim().length === 0) return bad(`${name}: harus string tidak kosong`);
  if (v.length > 1000) return bad(`${name}: terlalu panjang`);
  return v;
}

function sha(v: unknown, name: string): string {
  if (typeof v !== 'string' || !SHA256_HEX.test(v)) return bad(`${name}: harus hex SHA-256 huruf kecil 64 karakter`);
  return v;
}

function shaOrNull(v: unknown, name: string): string | null {
  return v === undefined || v === null ? null : sha(v, name);
}

function posInt(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) return bad(`${name}: harus bilangan bulat positif`);
  return v;
}

function nonNegInt(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) return bad(`${name}: harus bilangan bulat >= 0`);
  return v;
}

function score(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_TOTAL_SCORE) return bad(`${name}: harus angka 0..${MAX_TOTAL_SCORE}`);
  return v;
}

function oneOf<T extends string>(v: unknown, list: readonly T[], name: string): T {
  if (typeof v !== 'string' || !(list as readonly string[]).includes(v)) return bad(`${name}: harus salah satu dari ${list.join(', ')}`);
  return v as T;
}

/** Tanggal kalender nyata YYYY-MM-DD (tanpa rollover seperti 2026-02-30). */
export function isValidDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function dateStr(v: unknown, name: string): string {
  if (typeof v !== 'string' || !isValidDate(v)) return bad(`${name}: harus tanggal valid YYYY-MM-DD`);
  return v;
}

function isoTimestamp(v: unknown, name: string): string {
  if (typeof v !== 'string') return bad(`${name}: harus ISO-8601 UTC`);
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?Z$/.exec(v);
  if (!m || !isValidDate(m[1]!) || Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4]) > 59) {
    return bad(`${name}: harus ISO-8601 UTC (YYYY-MM-DDTHH:mm:ss[.fff]Z)`);
  }
  return v;
}

function docRef(v: unknown, i: number): DocumentRef {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return bad(`documents[${i}]: harus objek`);
  const o = v as Obj;
  checkKeys(o, `documents[${i}]`, ['type', 'cid', 'sha256', 'sizeBytes']);
  return {
    type: oneOf(o.type, DOCUMENT_TYPES, `documents[${i}].type`),
    cid: str(o.cid, `documents[${i}].cid`),
    sha256: sha(o.sha256, `documents[${i}].sha256`),
    sizeBytes: nonNegInt(o.sizeBytes, `documents[${i}].sizeBytes`),
  };
}

export function validateSubmission(json: string): SubmissionPayload {
  const o = parseObject(json, 'SubmissionPayload');
  checkKeys(o, 'SubmissionPayload', ['institutionId', 'programId', 'documentSetVersion', 'documents']);
  if (!Array.isArray(o.documents) || o.documents.length === 0) bad('documents: harus array tidak kosong');
  const documents = (o.documents as unknown[]).map(docRef);
  const types = new Set(documents.map((d) => d.type));
  if (!types.has('LED') || !types.has('LKPS')) bad('documents: wajib memuat LED dan LKPS');
  return {
    institutionId: str(o.institutionId, 'institutionId'),
    programId: str(o.programId, 'programId'),
    documentSetVersion: posInt(o.documentSetVersion, 'documentSetVersion'),
    documents,
  };
}

export function validateAdminVerification(json: string): AdminVerificationPayload {
  const o = parseObject(json, 'AdminVerificationPayload');
  checkKeys(o, 'AdminVerificationPayload', ['documentSetVersion', 'result'], ['notesSha256']);
  return {
    documentSetVersion: posInt(o.documentSetVersion, 'documentSetVersion'),
    result: oneOf(o.result, ['APPROVED', 'REVISION_REQUIRED', 'REJECTED'] as const, 'result'),
    notesSha256: shaOrNull(o.notesSha256, 'notesSha256'),
  };
}

export function validateAssessorOffer(json: string): AssessorOfferPayload {
  const o = parseObject(json, 'AssessorOfferPayload');
  checkKeys(o, 'AssessorOfferPayload', ['offerNo', 'assessorUids', 'leadUid'], ['replacesOfferSeq']);
  if (!Array.isArray(o.assessorUids) || o.assessorUids.length !== 2) bad('assessorUids: harus tepat 2 asesor');
  const a = idString((o.assessorUids as unknown[])[0], 'assessorUids[0]');
  const b = idString((o.assessorUids as unknown[])[1], 'assessorUids[1]');
  if (a === b) bad('assessorUids: kedua asesor harus berbeda');
  const lead = idString(o.leadUid, 'leadUid');
  if (lead !== a && lead !== b) bad('leadUid: ketua harus salah satu dari pasangan asesor');
  const replaces = o.replacesOfferSeq === undefined || o.replacesOfferSeq === null ? null : posInt(o.replacesOfferSeq, 'replacesOfferSeq');
  return { offerNo: posInt(o.offerNo, 'offerNo'), assessorUids: [a, b], leadUid: lead, replacesOfferSeq: replaces };
}

export function validateAssignmentResponse(json: string): AssignmentResponsePayload {
  const o = parseObject(json, 'AssignmentResponsePayload');
  checkKeys(o, 'AssignmentResponsePayload', ['offerSeq', 'responderRole', 'response'], ['reasonSha256']);
  return {
    offerSeq: posInt(o.offerSeq, 'offerSeq'),
    responderRole: oneOf(o.responderRole, ['asesor', 'upps'] as const, 'responderRole'),
    response: oneOf(o.response, ['ACCEPT', 'REJECT'] as const, 'response'),
    reasonSha256: shaOrNull(o.reasonSha256, 'reasonSha256'),
  };
}

export function validateAssessmentResult(json: string): AssessmentResultPayload {
  const o = parseObject(json, 'AssessmentResultPayload');
  checkKeys(
    o,
    'AssessmentResultPayload',
    ['phase', 'offerSeq', 'scoreSummarySha256', 'totalScore', 'documentSetVersion'],
    ['minutesCid', 'minutesSha256'],
  );
  const phase = oneOf(o.phase, ['AK', 'AL'] as const, 'phase');
  const minutesCid = o.minutesCid === undefined || o.minutesCid === null ? null : str(o.minutesCid, 'minutesCid');
  const minutesSha256 = shaOrNull(o.minutesSha256, 'minutesSha256');
  if (phase === 'AL' && (minutesCid === null || minutesSha256 === null)) bad('AL: minutesCid dan minutesSha256 (berita acara) wajib');
  if (phase === 'AK' && (minutesCid !== null || minutesSha256 !== null)) bad('AK: minutesCid/minutesSha256 harus null');
  return {
    phase,
    offerSeq: posInt(o.offerSeq, 'offerSeq'),
    scoreSummarySha256: sha(o.scoreSummarySha256, 'scoreSummarySha256'),
    totalScore: score(o.totalScore, 'totalScore'),
    minutesCid,
    minutesSha256,
    documentSetVersion: posInt(o.documentSetVersion, 'documentSetVersion'),
  };
}

export function validateFinalVerification(json: string): FinalVerificationPayload {
  const o = parseObject(json, 'FinalVerificationPayload');
  checkKeys(o, 'FinalVerificationPayload', ['alRecordKey', 'akRecordKeys'], ['notesSha256']);
  if (!Array.isArray(o.akRecordKeys) || o.akRecordKeys.length !== 2) bad('akRecordKeys: harus tepat 2 kunci');
  const a = str((o.akRecordKeys as unknown[])[0], 'akRecordKeys[0]');
  const b = str((o.akRecordKeys as unknown[])[1], 'akRecordKeys[1]');
  if (a === b) bad('akRecordKeys: kedua kunci harus berbeda');
  return { alRecordKey: str(o.alRecordKey, 'alRecordKey'), akRecordKeys: [a, b], notesSha256: shaOrNull(o.notesSha256, 'notesSha256') };
}

export function validateDecision(json: string): DecisionPayload {
  const o = parseObject(json, 'DecisionPayload');
  checkKeys(o, 'DecisionPayload', ['rank', 'totalScore', 'decreeNumber', 'finalVerificationKey'], ['validFrom', 'validUntil']);
  const rank = oneOf(o.rank, ACCREDITATION_RANKS, 'rank');
  const hasFrom = o.validFrom !== undefined && o.validFrom !== null;
  const hasUntil = o.validUntil !== undefined && o.validUntil !== null;
  let validFrom: string | null = null;
  let validUntil: string | null = null;
  if (rank === 'TIDAK_TERAKREDITASI') {
    if (hasFrom || hasUntil) bad('validFrom/validUntil harus null untuk TIDAK_TERAKREDITASI');
  } else {
    validFrom = dateStr(o.validFrom, 'validFrom');
    validUntil = dateStr(o.validUntil, 'validUntil');
    if (validUntil <= validFrom) bad('validUntil harus setelah validFrom');
  }
  return {
    rank,
    totalScore: score(o.totalScore, 'totalScore'),
    decreeNumber: str(o.decreeNumber, 'decreeNumber'),
    validFrom,
    validUntil,
    finalVerificationKey: str(o.finalVerificationKey, 'finalVerificationKey'),
  };
}

export function validateAuditEvent(json: string): AuditEvent {
  const o = parseObject(json, 'AuditEvent');
  checkKeys(o, 'AuditEvent', [
    'eventId',
    'aggregateType',
    'aggregateId',
    'submissionId',
    'kind',
    'version',
    'payloadSha256',
    'actorUid',
    'actorRole',
    'occurredAt',
  ]);
  return {
    eventId: idString(o.eventId, 'eventId'),
    aggregateType: oneOf(o.aggregateType, AGGREGATE_TYPES, 'aggregateType'),
    aggregateId: str(o.aggregateId, 'aggregateId'),
    submissionId: o.submissionId === null ? null : idString(o.submissionId, 'submissionId'),
    kind: oneOf(o.kind, AUDIT_EVENT_KINDS, 'kind'),
    version: posInt(o.version, 'version'),
    payloadSha256: sha(o.payloadSha256, 'payloadSha256'),
    actorUid: str(o.actorUid, 'actorUid'),
    actorRole: oneOf(o.actorRole, APP_ROLES, 'actorRole'),
    occurredAt: isoTimestamp(o.occurredAt, 'occurredAt'),
  };
}

const PAYLOAD_VALIDATORS: { [K in RecordType]: (json: string) => RecordPayloadMap[K] } = {
  SUBMISSION: validateSubmission,
  ADMIN_VERIFICATION: validateAdminVerification,
  ASSESSOR_OFFER: validateAssessorOffer,
  ASSIGNMENT_RESPONSE: validateAssignmentResponse,
  ASSESSMENT_RESULT: validateAssessmentResult,
  FINAL_VERIFICATION: validateFinalVerification,
  DECISION: validateDecision,
};

export function validatePayload<T extends RecordType>(type: T, json: string): RecordPayloadMap[T] {
  return PAYLOAD_VALIDATORS[type](json);
}
