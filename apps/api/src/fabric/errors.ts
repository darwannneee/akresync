import { AppError } from '../errors.js';

const CODE_RE = /\b(FORBIDDEN|PRECONDITION_FAILED|NOT_FOUND|INVALID_ARGUMENT|VERSION_CONFLICT|AUDIT_CONFLICT):\s*([^\n\r]*)/;

const STATUS: Record<string, number> = {
  FORBIDDEN: 403,
  PRECONDITION_FAILED: 409,
  NOT_FOUND: 404,
  INVALID_ARGUMENT: 400,
  VERSION_CONFLICT: 409,
  AUDIT_CONFLICT: 409,
};

/** Kumpulkan semua teks pesan dari error gateway (message + details[].message + cause). */
export function collectErrorText(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  const visit = (e: unknown) => {
    if (!e || typeof e !== 'object' || seen.has(e)) return;
    seen.add(e);
    const o = e as { message?: unknown; details?: unknown; cause?: unknown };
    if (typeof o.message === 'string') parts.push(o.message);
    if (Array.isArray(o.details)) for (const d of o.details) visit(d);
    visit(o.cause);
  };
  visit(err);
  return parts.join('\n');
}

export function mapChainError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const text = collectErrorText(err);
  const m = CODE_RE.exec(text);
  if (m) {
    const code = m[1] as string;
    return new AppError(STATUS[code] ?? 400, code, (m[2] ?? '').trim() || code, { source: 'chaincode' });
  }
  if (err instanceof ChainCommitError) {
    return new AppError(502, 'CHAIN_COMMIT_FAILED', `Transaksi tidak valid di ledger (kode ${err.statusCode})`, { txId: err.txId });
  }
  return new AppError(502, 'CHAIN_UNAVAILABLE', 'Jaringan Fabric tidak dapat memproses transaksi', { reason: text.slice(0, 300) });
}

/** Transaksi ter-commit di blok tetapi tidak VALID. */
export class ChainCommitError extends Error {
  constructor(
    public readonly txId: string,
    public readonly statusCode: number,
  ) {
    super(`Transaksi ${txId} tidak VALID (kode ${statusCode})`);
    this.name = 'ChainCommitError';
  }
}
