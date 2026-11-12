import { readFileSync } from 'node:fs';
import * as grpc from '@grpc/grpc-js';
import type { NetworkFile } from '../config/index.js';

export class PeerClients {
  private clients = new Map<string, grpc.Client>();
  constructor(private readonly network: NetworkFile) {}

  get(mspId: string): grpc.Client {
    let c = this.clients.get(mspId);
    if (!c) {
      const org = this.network.orgs[mspId];
      if (!org) throw new Error(`Org ${mspId} tidak ada di network.json`);
      const creds = grpc.credentials.createSsl(readFileSync(org.peerTlsCaPath));
      c = new grpc.Client(org.peerEndpoint, creds, { 'grpc.ssl_target_name_override': org.peerHostAlias });
      this.clients.set(mspId, c);
    }
    return c;
  }

  close(): void {
    for (const c of this.clients.values()) c.close();
    this.clients.clear();
  }
}
