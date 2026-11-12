import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { APP_TO_FABRIC_ROLE, AUDIT_SERVICE_UID, type AppRole } from '@akreditasi/shared';
import { getConfig, loadNetwork, resolvePath } from '../src/config/index.js';
import { createUser } from '../src/auth/users.js';
import { closePool, getPool, q1, withTransaction } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { enrollForAppRole, enrollIdentity, storeIdentity } from '../src/fabric/identity.js';

const cfg = getConfig();
const pool = getPool();
const applied = await runMigrations(pool);
if (applied.length) console.log('Migrasi:', applied.join(', '));

const inst =
  (await q1(pool, `SELECT id FROM institutions WHERE pddikti_code='SEED-001'`)) ??
  (await q1(pool, `INSERT INTO institutions (name, pddikti_code) VALUES ('Universitas Contoh Nusantara','SEED-001') RETURNING id`));
const prog =
  (await q1(pool, `SELECT id FROM study_programs WHERE institution_id=$1 AND name='Doktor Ilmu Komputer' AND level='S3'`, [inst!.id])) ??
  (await q1(pool, `INSERT INTO study_programs (institution_id, name, level) VALUES ($1,'Doktor Ilmu Komputer','S3') RETURNING id`, [inst!.id]));

const accountsFile = resolvePath(cfg.SEED_ACCOUNTS_FILE);
const existing: Record<string, { email: string; password: string; role: string }> = existsSync(accountsFile) ? JSON.parse(readFileSync(accountsFile, 'utf8')) : {};

const ACCOUNTS: { key: string; email: string; role: AppRole; name: string }[] = [
  { key: 'upps', email: 'upps@akreditasi.test', role: 'upps', name: 'Operator UPPS' },
  { key: 'sekadm', email: 'sekadm@akreditasi.test', role: 'sek_adm', name: 'Sekretariat Administrasi' },
  { key: 'sekkeu', email: 'sekkeu@akreditasi.test', role: 'sek_keu', name: 'Sekretariat Keuangan' },
  { key: 'kea', email: 'kea@akreditasi.test', role: 'kea', name: 'Anggota KEA' },
  { key: 'majelis', email: 'majelis@akreditasi.test', role: 'majelis', name: 'Anggota Majelis' },
  { key: 'asesor1', email: 'asesor1@akreditasi.test', role: 'asesor', name: 'Asesor Satu' },
  { key: 'asesor2', email: 'asesor2@akreditasi.test', role: 'asesor', name: 'Asesor Dua' },
];

for (const a of ACCOUNTS) {
  const user = await q1(pool, 'SELECT id FROM users WHERE email=$1', [a.email]);
  if (user) {
    if (APP_TO_FABRIC_ROLE[a.role] && !(await q1(pool, 'SELECT 1 FROM fabric_identities WHERE user_id=$1', [user.id]))) {
      const id = await enrollForAppRole(user.id, a.role);
      if (id) await withTransaction((c) => storeIdentity(c, user.id, id), pool);
      console.log(`Identitas Fabric dilengkapi: ${a.email}`);
    } else console.log(`Sudah ada: ${a.email}`);
    continue;
  }
  const password = randomBytes(15).toString('base64url');
  await createUser(pool, { email: a.email, password, fullName: a.name, role: a.role, institutionId: a.role === 'upps' ? inst!.id : null });
  existing[a.key] = { email: a.email, password, role: a.role };
  console.log(`Dibuat: ${a.email}`);
}

mkdirSync(path.dirname(accountsFile), { recursive: true });
writeFileSync(accountsFile, JSON.stringify(existing, null, 2), { mode: 0o600 });
chmodSync(accountsFile, 0o600);

// Identitas layanan audit (CA Sekretariat), role=audit, uid=audit-service.
const auditDir = resolvePath(cfg.AUDIT_IDENTITY_DIR);
if (existsSync(path.join(auditDir, 'cert.pem')) && existsSync(path.join(auditDir, 'key.pem'))) {
  console.log('Identitas audit sudah ada:', auditDir);
} else {
  const id = await enrollIdentity({ enrollmentId: AUDIT_SERVICE_UID, fabricRole: 'audit', uid: AUDIT_SERVICE_UID, network: loadNetwork(cfg), allowExisting: true });
  mkdirSync(auditDir, { recursive: true });
  writeFileSync(path.join(auditDir, 'cert.pem'), id.certificatePem, { mode: 0o600 });
  writeFileSync(path.join(auditDir, 'key.pem'), id.privateKeyPem, { mode: 0o600 });
  console.log('Identitas audit di-enroll:', auditDir);
}
console.log('Akun uji (kata sandi) ditulis ke', accountsFile);
await closePool();
