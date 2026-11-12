import { ChainCommitError } from './errors.js';

/** Kode validasi Fabric: MVCC_READ_CONFLICT = 11, VALID = 0. */
export const MVCC_READ_CONFLICT = 11;

export interface SubmittedLike {
  getTransactionId(): string;
  getResult(): Uint8Array;
  getStatus(): Promise<{ successful: boolean; code: number; blockNumber: bigint }>;
}
export interface ContractLike {
  submitAsync(name: string, options: { arguments: string[] }): Promise<SubmittedLike>;
  evaluateTransaction(name: string, ...args: string[]): Promise<Uint8Array>;
}

export interface SubmitResult {
  txId: string;
  blockNumber: string;
  result: Buffer;
}

export interface RetryOptions {
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Kirim transaksi, tunggu status commit, anggap sukses HANYA jika VALID.
 * Coba ulang (proposal baru) maksimal 3x untuk MVCC_READ_CONFLICT.
 */
export async function submitWithRetry(contract: ContractLike, fn: string, args: string[], opts: RetryOptions = {}): Promise<SubmitResult> {
  const max = opts.maxAttempts ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: ChainCommitError | undefined;
  for (let attempt = 1; attempt <= max; attempt++) {
    const submitted = await contract.submitAsync(fn, { arguments: args });
    const status = await submitted.getStatus();
    if (status.successful) {
      return { txId: submitted.getTransactionId(), blockNumber: status.blockNumber.toString(), result: Buffer.from(submitted.getResult()) };
    }
    last = new ChainCommitError(submitted.getTransactionId(), status.code);
    if (status.code !== MVCC_READ_CONFLICT) throw last;
    await sleep(100 * attempt);
  }
  throw last ?? new Error('submit gagal');
}
