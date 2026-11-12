import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { connect, signers, type Gateway } from '@hyperledger/fabric-gateway';
import { CHAINCODE, MSP_IDS, type FormalRecord } from '@akreditasi/shared';
import { getConfig, loadNetwork, resolvePath, type NetworkFile } from '../config/index.js';
import { decryptSecret } from '../crypto/envelope.js';
import { getPool, q1 } from '../db/pool.js';
import { AppError } from '../errors.js';
import { mapChainError } from './errors.js';
import { PeerClients } from './network.js';
import { submitWithRetry, type ContractLike } from './submit.js';

export interface ChainSubmit {
  txId: string;
  blockNumber: string;
  record: FormalRecord | null;
  recordBytes: number;
}

/** Antarmuka klien chain (dimock di test). `userId` = pemanggil; null = identitas layanan (audit) untuk query. */
export interface ChainClient {
  submit(userId: string, fn: string, args: string[]): Promise<ChainSubmit>;
  evaluate<T = unknown>(userId: string | null, fn: string, args: string[]): Promise<T>;
  ping(): Promise<boolean>;
  close(): void;
}

interface Cached {
  gateway: Gateway;
  contract: ContractLike;
}

export class FabricChainClient implements ChainClient {
  private readonly network: NetworkFile;
  private readonly peers: PeerClients;
  private readonly pool = new Map<string, Promise<Cached>>();

  constructor(network: NetworkFile = loadNetwork()) {
    this.network = network;
    this.peers = new PeerClients(network);
  }

  private async open(key: string, mspId: string, certPem: string, keyPem: string): Promise<Cached> {
    const gateway = connect({
      client: this.peers.get(mspId),
      identity: { mspId, credentials: Buffer.from(certPem) },
      signer: signers.newPrivateKeySigner(createPrivateKey(keyPem)),
      evaluateOptions: () => ({ deadline: Date.now() + 10_000 }),
      endorseOptions: () => ({ deadline: Date.now() + 20_000 }),
      submitOptions: () => ({ deadline: Date.now() + 10_000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 60_000 }),
    });
    const contract = gateway.getNetwork(this.network.channel ?? CHAINCODE.channel).getContract(this.network.chaincode ?? CHAINCODE.name, CHAINCODE.contract);
    return { gateway, contract: contract as unknown as ContractLike };
  }

  private async userContract(userId: string): Promise<ContractLike> {
    let p = this.pool.get(userId);
    if (!p) {
      p = (async () => {
        const row = await q1<{ msp_id: string; certificate_pem: string; encrypted_private_key: Buffer; key_iv: Buffer; key_tag: Buffer }>(
          getPool(),
          'SELECT msp_id, certificate_pem, encrypted_private_key, key_iv, key_tag FROM fabric_identities WHERE user_id = $1',
          [userId],
        );
        if (!row) throw new AppError(403, 'NO_FABRIC_IDENTITY', 'Pengguna tidak memiliki identitas Fabric');
        const keyPem = decryptSecret({ encrypted: row.encrypted_private_key, iv: row.key_iv, tag: row.key_tag }, getConfig().IDENTITY_MASTER_KEY, userId);
        return this.open(userId, row.msp_id, row.certificate_pem, keyPem);
      })();
      this.pool.set(userId, p);
      p.catch(() => this.pool.delete(userId));
    }
    return (await p).contract;
  }

  private async auditContract(): Promise<ContractLike> {
    let p = this.pool.get('__audit__');
    if (!p) {
      const dir = resolvePath(getConfig().AUDIT_IDENTITY_DIR);
      p = this.open('__audit__', MSP_IDS.sekretariat, readFileSync(path.join(dir, 'cert.pem'), 'utf8'), readFileSync(path.join(dir, 'key.pem'), 'utf8'));
      this.pool.set('__audit__', p);
      p.catch(() => this.pool.delete('__audit__'));
    }
    return (await p).contract;
  }

  async submit(userId: string, fn: string, args: string[]): Promise<ChainSubmit> {
    try {
      const contract = await this.userContract(userId);
      const r = await submitWithRetry(contract, fn, args);
      return { txId: r.txId, blockNumber: r.blockNumber, ...parseRecord(r.result) };
    } catch (err) {
      throw mapChainError(err);
    }
  }

  async evaluate<T = unknown>(userId: string | null, fn: string, args: string[]): Promise<T> {
    try {
      let contract: ContractLike;
      if (userId) {
        const has = await q1(getPool(), 'SELECT 1 FROM fabric_identities WHERE user_id = $1', [userId]);
        contract = has ? await this.userContract(userId) : await this.auditContract();
      } else {
        contract = await this.auditContract();
      }
      const bytes = await contract.evaluateTransaction(fn, ...args);
      const text = Buffer.from(bytes).toString('utf8');
      return (text ? JSON.parse(text) : null) as T;
    } catch (err) {
      throw mapChainError(err);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const msp = Object.keys(this.network.orgs)[0];
      if (!msp) return false;
      await new Promise<void>((resolve, reject) => this.peers.get(msp).waitForReady(Date.now() + 3000, (e) => (e ? reject(e) : resolve())));
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    for (const p of this.pool.values()) void p.then((c) => c.gateway.close()).catch(() => undefined);
    this.pool.clear();
    this.peers.close();
  }
}

export function parseRecord(result: Buffer): { record: FormalRecord | null; recordBytes: number } {
  if (result.length === 0) return { record: null, recordBytes: 0 };
  try {
    const parsed = JSON.parse(result.toString('utf8')) as FormalRecord;
    return { record: parsed && typeof parsed === 'object' && 'recordKey' in parsed ? parsed : null, recordBytes: result.length };
  } catch {
    return { record: null, recordBytes: result.length };
  }
}
