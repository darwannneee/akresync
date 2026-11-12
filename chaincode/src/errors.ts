import type { ChainErrorCode } from '@akreditasi/shared';

/** Semua kegagalan chaincode: `KODE: pesan` agar klien bisa memetakan kode dari awalan pesan. */
export function fail(code: ChainErrorCode, message: string): never {
  throw new Error(`${code}: ${message}`);
}
