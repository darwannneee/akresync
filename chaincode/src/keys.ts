import type { ChaincodeStub } from 'fabric-shim';
import { RECORD_TYPES, type RecordType } from '@akreditasi/shared';
import { fail } from './errors';

export const KEY = {
  STAGE: 'STAGE',
  SEQ: 'SEQ',
  REQ: 'REQ',
  AUDIT: 'AUDIT',
  AUDITIDX: 'AUDITIDX',
} as const;

export function seq4(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999) fail('PRECONDITION_FAILED', `urutan catatan di luar jangkauan: ${seq}`);
  return String(seq).padStart(4, '0');
}

export function recordKey(stub: ChaincodeStub, type: RecordType, submissionId: string, seq: number): string {
  return stub.createCompositeKey(type, [submissionId, seq4(seq)]);
}

export function parseRecordKey(stub: ChaincodeStub, key: string): { type: RecordType; submissionId: string; seq: number } {
  let split: { objectType: string; attributes: string[] };
  try {
    split = stub.splitCompositeKey(key);
  } catch {
    return fail('INVALID_ARGUMENT', 'recordKey bukan kunci komposit yang valid');
  }
  const [submissionId, s] = split.attributes;
  if (!(RECORD_TYPES as readonly string[]).includes(split.objectType) || !submissionId || !s || split.attributes.length !== 2 || !/^\d{4}$/.test(s)) {
    return fail('INVALID_ARGUMENT', 'recordKey bukan kunci catatan formal');
  }
  return { type: split.objectType as RecordType, submissionId, seq: Number(s) };
}

export const stageKey = (stub: ChaincodeStub, submissionId: string) => stub.createCompositeKey(KEY.STAGE, [submissionId]);
export const seqKey = (stub: ChaincodeStub, submissionId: string) => stub.createCompositeKey(KEY.SEQ, [submissionId]);
export const reqKey = (stub: ChaincodeStub, requestId: string) => stub.createCompositeKey(KEY.REQ, [requestId]);
export const auditKey = (stub: ChaincodeStub, eventId: string) => stub.createCompositeKey(KEY.AUDIT, [eventId]);
export const auditIdxKey = (stub: ChaincodeStub, submissionId: string, kind: string, eventId: string) =>
  stub.createCompositeKey(KEY.AUDITIDX, [submissionId, kind, eventId]);
