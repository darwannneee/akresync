import { getConfig } from '../config/index.js';
import { AppError } from '../errors.js';

export interface IpfsClient {
  add(data: Buffer, name?: string): Promise<string>;
  cat(cid: string): Promise<Buffer>;
  pin(cid: string): Promise<void>;
  ping(): Promise<boolean>;
}

/** Klien Kubo HTTP RPC (POST /api/v0/...). API hanya dibuka di 127.0.0.1. */
export function createIpfsClient(baseUrl = getConfig().IPFS_API_URL): IpfsClient {
  const url = (p: string) => `${baseUrl.replace(/\/$/, '')}/api/v0/${p}`;
  /** Galat jaringan ke Kubo (mati/timeout) → 503 ramah; respons non-2xx → 502 ramah. Tidak membocorkan detail internal. */
  const req = async (p: string, init: RequestInit): Promise<Response> => {
    let res: Response;
    try {
      res = await fetch(url(p), init);
    } catch (err) {
      throw new AppError(503, 'IPFS_UNAVAILABLE', 'Penyimpanan berkas (IPFS) sedang tidak tersedia; tidak ada data yang tersimpan. Silakan coba lagi sebentar lagi.', { reason: String((err as Error).message).slice(0, 200) });
    }
    if (!res.ok) throw new AppError(res.status >= 500 ? 503 : 502, 'IPFS_ERROR', 'Penyimpanan berkas (IPFS) tidak dapat memproses permintaan; silakan coba lagi', { status: res.status });
    return res;
  };
  return {
    async add(data, name = 'blob') {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(data)]), name);
      const res = await req('add?pin=true&cid-version=1&quiet=false', { method: 'POST', body: form });
      const lines = (await res.text()).trim().split('\n');
      const last = JSON.parse(lines[lines.length - 1] ?? '{}') as { Hash?: string };
      if (!last.Hash) throw new Error('IPFS add: CID tidak ada pada respons');
      return last.Hash;
    },
    async cat(cid) {
      const res = await req(`cat?arg=${encodeURIComponent(cid)}`, { method: 'POST', signal: AbortSignal.timeout(60_000) });
      return Buffer.from(await res.arrayBuffer());
    },
    async pin(cid) {
      await req(`pin/add?arg=${encodeURIComponent(cid)}`, { method: 'POST' });
    },
    async ping() {
      try {
        const res = await fetch(url('id'), { method: 'POST', signal: AbortSignal.timeout(3000) });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
