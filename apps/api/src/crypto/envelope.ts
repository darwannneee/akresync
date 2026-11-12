import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedBlob {
  ciphertext: Buffer;
  fileIv: Buffer;
  fileTag: Buffer;
  wrappedDek: Buffer;
  dekIv: Buffer;
  dekTag: Buffer;
}

function gcmEncrypt(key: Buffer, plain: Buffer, aad?: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  if (aad) c.setAAD(aad);
  const ciphertext = Buffer.concat([c.update(plain), c.final()]);
  return { iv, tag: c.getAuthTag(), ciphertext };
}

function gcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, data: Buffer, aad?: Buffer): Buffer {
  const d = createDecipheriv('aes-256-gcm', key, iv);
  if (aad) d.setAAD(aad);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]);
}

/** Enkripsi envelope: DEK acak per berkas, DEK dibungkus master key. */
export function encryptFile(plain: Buffer, masterKey: Buffer): EncryptedBlob {
  const dek = randomBytes(32);
  const file = gcmEncrypt(dek, plain);
  const wrapped = gcmEncrypt(masterKey, dek);
  return {
    ciphertext: file.ciphertext,
    fileIv: file.iv,
    fileTag: file.tag,
    wrappedDek: wrapped.ciphertext,
    dekIv: wrapped.iv,
    dekTag: wrapped.tag,
  };
}

export function decryptFile(blob: EncryptedBlob, masterKey: Buffer): Buffer {
  const dek = gcmDecrypt(masterKey, blob.dekIv, blob.dekTag, blob.wrappedDek);
  return gcmDecrypt(dek, blob.fileIv, blob.fileTag, blob.ciphertext);
}

/** Enkripsi kunci privat identitas Fabric dengan IDENTITY_MASTER_KEY; AAD = id pengguna agar tidak bisa dipindah antar baris. */
export function encryptSecret(plain: string, masterKey: Buffer, aad: string) {
  const r = gcmEncrypt(masterKey, Buffer.from(plain, 'utf8'), Buffer.from(aad));
  return { encrypted: r.ciphertext, iv: r.iv, tag: r.tag };
}

export function decryptSecret(enc: { encrypted: Buffer; iv: Buffer; tag: Buffer }, masterKey: Buffer, aad: string): string {
  return gcmDecrypt(masterKey, enc.iv, enc.tag, enc.encrypted, Buffer.from(aad)).toString('utf8');
}
