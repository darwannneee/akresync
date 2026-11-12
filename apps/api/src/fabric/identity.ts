import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import FabricCAServices from 'fabric-ca-client';
import { User } from 'fabric-common';
import { APP_TO_FABRIC_ROLE, FABRIC_ROLE_MSP, type AppRole, type FabricRole } from '@akreditasi/shared';
import { getConfig, loadNetwork, type NetworkFile } from '../config/index.js';
import { encryptSecret } from '../crypto/envelope.js';
import type { Queryable } from '../db/pool.js';

export interface EnrolledIdentity {
  mspId: string;
  enrollmentId: string;
  fabricRole: FabricRole;
  certificatePem: string;
  privateKeyPem: string;
}

/** Akar kepercayaan CA: berkas yang dikonfigurasi + `ca-cert.pem` di direktori yang sama (penerbit sertifikat TLS fabric-ca). */
function caRoots(configured: string): string[] {
  const roots = [readFileSync(configured, 'utf8')];
  const sibling = path.join(path.dirname(configured), 'ca-cert.pem');
  if (sibling !== configured && existsSync(sibling)) roots.push(readFileSync(sibling, 'utf8'));
  return roots;
}

const registrars = new Map<string, Promise<{ ca: FabricCAServices; registrar: User }>>();

async function caFor(mspId: string, network: NetworkFile) {
  let p = registrars.get(mspId);
  if (!p) {
    p = (async () => {
      const org = network.orgs[mspId];
      if (!org) throw new Error(`Org ${mspId} tidak ada di network.json`);
      const ca = new FabricCAServices(
        org.caUrl,
        { trustedRoots: caRoots(org.caTlsCertPath), verify: process.env.FABRIC_CA_TLS_VERIFY !== 'false' },
        org.caName,
      );
      const e = await ca.enroll({ enrollmentID: org.registrarId, enrollmentSecret: org.registrarSecret });
      const registrar = User.createUser(org.registrarId, org.registrarSecret, mspId, e.certificate, e.key.toBytes());
      return { ca, registrar };
    })();
    registrars.set(mspId, p);
    p.catch(() => registrars.delete(mspId));
  }
  return p;
}

/** Daftarkan + enroll identitas di CA org terkait dengan atribut ecert role & uid. */
export async function enrollIdentity(opts: {
  enrollmentId: string;
  fabricRole: FabricRole;
  uid: string;
  network?: NetworkFile;
  allowExisting?: boolean;
}): Promise<EnrolledIdentity> {
  const network = opts.network ?? loadNetwork();
  const mspId = FABRIC_ROLE_MSP[opts.fabricRole];
  const { ca, registrar } = await caFor(mspId, network);
  const secret = randomBytes(18).toString('base64url');
  const attrs = [
    { name: 'role', value: opts.fabricRole, ecert: true },
    { name: 'uid', value: opts.uid, ecert: true },
  ];
  try {
    await ca.register({ enrollmentID: opts.enrollmentId, enrollmentSecret: secret, role: 'client', affiliation: '', maxEnrollments: -1, attrs }, registrar);
  } catch (err) {
    if (!opts.allowExisting || !/already registered|code: 74/i.test(String((err as Error).message))) throw err;
    await ca.newIdentityService().update(opts.enrollmentId, { enrollmentID: opts.enrollmentId, affiliation: '', enrollmentSecret: secret, maxEnrollments: -1, attrs }, registrar);
  }
  const enrollment = await ca.enroll({
    enrollmentID: opts.enrollmentId,
    enrollmentSecret: secret,
    attr_reqs: [
      { name: 'role', optional: false },
      { name: 'uid', optional: false },
    ],
  });
  return { mspId, enrollmentId: opts.enrollmentId, fabricRole: opts.fabricRole, certificatePem: enrollment.certificate, privateKeyPem: enrollment.key.toBytes() };
}

export const enrollmentIdFor = (role: FabricRole, userId: string) => `${role}-${userId}`;

export async function storeIdentity(db: Queryable, userId: string, id: EnrolledIdentity): Promise<void> {
  const enc = encryptSecret(id.privateKeyPem, getConfig().IDENTITY_MASTER_KEY, userId);
  await db.query(
    `INSERT INTO fabric_identities (user_id, msp_id, enrollment_id, fabric_role, certificate_pem, encrypted_private_key, key_iv, key_tag)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id) DO UPDATE SET msp_id=EXCLUDED.msp_id, enrollment_id=EXCLUDED.enrollment_id, fabric_role=EXCLUDED.fabric_role,
       certificate_pem=EXCLUDED.certificate_pem, encrypted_private_key=EXCLUDED.encrypted_private_key, key_iv=EXCLUDED.key_iv, key_tag=EXCLUDED.key_tag`,
    [userId, id.mspId, id.enrollmentId, id.fabricRole, id.certificatePem, enc.encrypted, enc.iv, enc.tag],
  );
}

/** Enroll untuk peran aplikasi; null jika peran tidak punya identitas Fabric (sek_keu). */
export async function enrollForAppRole(userId: string, role: AppRole): Promise<EnrolledIdentity | null> {
  const fabricRole = APP_TO_FABRIC_ROLE[role];
  if (!fabricRole) return null;
  return enrollIdentity({ enrollmentId: enrollmentIdFor(fabricRole, userId), fabricRole, uid: userId });
}
