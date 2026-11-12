import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical.js';

export * from './index.js';

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hashSnapshot(snapshot: unknown): string {
  return sha256Hex(canonicalJson(snapshot));
}
