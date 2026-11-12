import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import { connect, signers, type Gateway } from '@hyperledger/fabric-gateway';
import type { AuditEvent } from '@akreditasi/shared';
import { CHAINCODE, CHAIN_FUNCTIONS } from '@akreditasi/shared';
import { MSP_SEKRETARIAT, loadNetwork, resolvePath, type WorkerConfig } from './config.js';
import type { SubmitOutcome } from './handler.js';

export class AuditSubmitter {
  private gateway: Gateway;
  private client: grpc.Client;
  private contract: ReturnType<ReturnType<Gateway['getNetwork']>['getContract']>;

  constructor(cfg: WorkerConfig) {
    const net = loadNetwork(cfg.FABRIC_NETWORK_FILE);
    const dir = resolvePath(cfg.AUDIT_IDENTITY_DIR);
    this.client = new grpc.Client(net.org.peerEndpoint, grpc.credentials.createSsl(readFileSync(net.org.peerTlsCaPath)), {
      'grpc.ssl_target_name_override': net.org.peerHostAlias,
    });
    this.gateway = connect({
      client: this.client,
      identity: { mspId: MSP_SEKRETARIAT, credentials: readFileSync(path.join(dir, 'cert.pem')) },
      signer: signers.newPrivateKeySigner(createPrivateKey(readFileSync(path.join(dir, 'key.pem')))),
      evaluateOptions: () => ({ deadline: Date.now() + 10_000 }),
      endorseOptions: () => ({ deadline: Date.now() + 20_000 }),
      submitOptions: () => ({ deadline: Date.now() + 10_000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 60_000 }),
    });
    this.contract = this.gateway.getNetwork(net.channel ?? CHAINCODE.channel).getContract(net.chaincode ?? CHAINCODE.name, CHAINCODE.contract);
  }

  /** RecordAudit; sukses hanya bila status commit VALID. */
  async submitAudit(event: AuditEvent): Promise<SubmitOutcome> {
    const tx = await this.contract.submitAsync(CHAIN_FUNCTIONS.RecordAudit, { arguments: [JSON.stringify(event)] });
    const status = await tx.getStatus();
    if (!status.successful) throw new Error(`transaksi ${tx.getTransactionId()} tidak VALID (kode ${status.code})`);
    return { txId: tx.getTransactionId(), blockNumber: status.blockNumber.toString() };
  }

  close(): void {
    this.gateway.close();
    this.client.close();
  }
}
