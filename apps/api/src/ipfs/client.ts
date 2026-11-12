import { getConfig } from '../config/index.js';

export interface IpfsClient {
  add(data: Buffer, name?: string): Promise<string>;
  cat(cid: string): Promise<Buffer>;
  pin(cid: string): Promise<void>;
  ping(): Promise<boolean>;
}

/** Klien Kubo HTTP RPC (POST /api/v0/...). API hanya dibuka di 127.0.0.1. */
export function createIpfsClient(baseUrl = getConfig().IPFS_API_URL): IpfsClient {
  const url = (p: string) => `${baseUrl.replace(/\/$/, '')}/api/v0/${p}`;
  return {
    async add(data, name = 'blob') {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(data)]), name);
      const res = await fetch(url('add?pin=true&cid-version=1&quiet=false'), { method: 'POST', body: form });
      if (!res.ok) throw new Error(`IPFS add gagal: ${res.status} ${await res.text()}`);
      const lines = (await res.text()).trim().split('\n');
      const last = JSON.parse(lines[lines.length - 1] ?? '{}') as { Hash?: string };
      if (!last.Hash) throw new Error('IPFS add: CID tidak ada pada respons');
      return last.Hash;
    },
    async cat(cid) {
      const res = await fetch(url(`cat?arg=${encodeURIComponent(cid)}`), { method: 'POST', signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`IPFS cat gagal: ${res.status} ${await res.text()}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async pin(cid) {
      const res = await fetch(url(`pin/add?arg=${encodeURIComponent(cid)}`), { method: 'POST' });
      if (!res.ok) throw new Error(`IPFS pin gagal: ${res.status} ${await res.text()}`);
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
