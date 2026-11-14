/**
 * Konversi skema gaya Gemini (type 'OBJECT'/'STRING', nullable, propertyOrdering) menjadi
 * JSON Schema ketat untuk OpenAI Structured Outputs (strict: true):
 * tipe huruf kecil, additionalProperties:false pada setiap objek, semua properti wajib,
 * nullable → type [x,'null'] (enum ikut memuat null), propertyOrdering dibuang.
 */
export function toStrictJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toStrictJsonSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const src = schema as Record<string, any>;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === 'propertyOrdering' || k === 'nullable') continue;
    if (k === 'type') out.type = Array.isArray(v) ? v.map((t) => String(t).toLowerCase()) : String(v).toLowerCase();
    else if (k === 'properties' && v && typeof v === 'object') out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toStrictJsonSchema(pv)]));
    else if (k === 'items') out.items = toStrictJsonSchema(v);
    else if (k === 'anyOf' || k === 'oneOf') out[k] = (v as unknown[]).map(toStrictJsonSchema);
    else out[k] = v;
  }
  if (out.type === 'object' || (Array.isArray(out.type) && out.type.includes('object'))) {
    const props = out.properties ?? {};
    out.properties = props;
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  if (src.nullable === true) {
    const types: string[] = Array.isArray(out.type) ? out.type : out.type ? [out.type] : [];
    if (types.length && !types.includes('null')) out.type = [...types, 'null'];
    if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
  }
  return out;
}
