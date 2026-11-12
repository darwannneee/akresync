import type { Context } from 'fabric-contract-api';
import { FABRIC_ROLES, FABRIC_ROLE_MSP, type FabricRole, type MspId, type RecordActor } from '@akreditasi/shared';
import { fail } from './errors';

function isFabricRole(value: string): value is FabricRole {
  return (FABRIC_ROLES as readonly string[]).includes(value);
}

/**
 * Identitas pemanggil dari sertifikat: MSP + atribut `role` & `uid`.
 * Pasangan MSP/role harus sesuai FABRIC_ROLE_MSP; selain itu ditolak.
 */
export function getCaller(ctx: Context): RecordActor {
  const mspId = ctx.clientIdentity.getMSPID();
  const role = ctx.clientIdentity.getAttributeValue('role');
  const uid = ctx.clientIdentity.getAttributeValue('uid');
  if (!role) fail('FORBIDDEN', 'sertifikat tidak memiliki atribut role');
  if (!uid) fail('FORBIDDEN', 'sertifikat tidak memiliki atribut uid');
  if (!isFabricRole(role)) fail('FORBIDDEN', `role tidak dikenal: ${role}`);
  if (FABRIC_ROLE_MSP[role] !== mspId) fail('FORBIDDEN', `pasangan MSP/role tidak sah: ${mspId}/${role}`);
  return { mspId: mspId as MspId, role, uid };
}

export function requireRole(caller: RecordActor, role: FabricRole): void {
  if (caller.role !== role) fail('FORBIDDEN', `fungsi ini hanya untuk role ${role}, pemanggil ${caller.role}`);
}
