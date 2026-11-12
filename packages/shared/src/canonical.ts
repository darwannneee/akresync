/**
 * JSON kanonik (mengikuti prinsip RFC 8785): kunci objek diurutkan, tanpa spasi,
 * undefined dibuang, angka non-finite ditolak. Dipakai agar hash snapshot sama di backend, worker, dan verifikator.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonicalJson: angka tidak terhingga tidak didukung');
      return JSON.stringify(value);
    case 'bigint':
      return JSON.stringify(value.toString());
    case 'object': {
      if (value instanceof Date) return JSON.stringify(value.toISOString());
      if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : serialize(v))).join(',')}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`).join(',')}}`;
    }
    default:
      throw new TypeError(`canonicalJson: tipe ${typeof value} tidak didukung`);
  }
}

export const SHA256_HEX = /^[0-9a-f]{64}$/;
