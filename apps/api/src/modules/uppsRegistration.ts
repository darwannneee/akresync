import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { API_ROUTES } from '@akreditasi/shared';
import { hashPassword, insertUserRow } from '../auth/users.js';
import type { AppContext } from '../context.js';
import { q, q1, withTransaction } from '../db/pool.js';
import { AppError, badRequest, conflict, notFound } from '../errors.js';
import { enrollIdentity, enrollmentIdFor, storeIdentity, type EnrolledIdentity } from '../fabric/identity.js';
import { envelope, mount, mountWith, parse, uuidParam } from '../lib/http.js';
import { logger } from '../logger.js';
import { camel, encryptAndStore, fetchAndDecrypt, sanitizeFileName, type StoredBlob } from './common.js';

export const MIN_PASSWORD = 8;
export const MAX_PDF_BYTES = 1024 * 1024;
export const MAX_PHOTO_BYTES = 500 * 1024;

type Kind = 'photo' | 'sppa' | 'spsu';
const KIND_COLUMN: Record<Kind, string> = { photo: 'photo_file_id', sppa: 'sppa_file_id', spsu: 'spsu_file_id' };
const KIND_LABEL: Record<Kind, string> = { photo: 'Foto penanggung jawab', sppa: 'Surat Pengajuan Permohonan Akun', spsu: 'Surat Pernyataan sebagai UPPS' };

const regUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF_BYTES + 1, files: 3, fields: 20, fieldSize: 64 * 1024 } }).fields([
  { name: 'photo', maxCount: 1 },
  { name: 'sppa', maxCount: 1 },
  { name: 'spsu', maxCount: 1 },
]);

/** Bungkus multer agar galatnya menjadi pesan 400 yang ramah (bukan pesan umum 25 MB). */
const regUploadSafe: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  regUpload(req, res, (err: unknown) => {
    if (!err) return next();
    const e = err as { name?: string; code?: string; field?: string };
    if (e.name === 'MulterError') {
      if (e.code === 'LIMIT_FILE_SIZE') return next(badRequest(`Ukuran berkas ${e.field ? `"${KIND_LABEL[e.field as Kind] ?? e.field}" ` : ''}melebihi batas`));
      return next(badRequest('Unggahan berkas tidak valid'));
    }
    next(err);
  });
};

const optText = (max: number) => z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(max).optional());
const optNum = (min: number, max: number) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().min(min).max(max).optional());

const programSchema = z.object({
  levelId: z.coerce.number().int().positive(),
  programNameId: z.coerce.number().int().positive(),
  headName: optText(200),
  location: optText(300),
  lat: optNum(-90, 90),
  lng: optNum(-180, 180),
});

const registerSchema = z.object({
  uppsName: z.string().trim().min(2, 'Nama UPPS wajib diisi').max(250),
  leaderName: z.string().trim().min(2, 'Nama pimpinan tertinggi UPPS wajib diisi').max(250),
  picName: z.string().trim().min(2, 'Nama penanggung jawab akun wajib diisi').max(250),
  email: z.string().trim().email('Penulisan surel belum benar').max(200),
  phone: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().regex(/^[0-9+()\-\s]{6,25}$/, 'Nomor telepon hanya boleh berisi angka, spasi, +, -, dan tanda kurung').optional(),
  ),
  institutionId: z.string().uuid('Institusi tidak valid'),
  password: z.string().min(MIN_PASSWORD, `Kata sandi minimal ${MIN_PASSWORD} karakter`).max(200),
  termsAccepted: z.literal('true', { errorMap: () => ({ message: 'Ketentuan dan persyaratan harus disetujui' }) }),
});

const isPdf = (b: Buffer) => b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-';
const isJpeg = (b: Buffer) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

function parsePrograms(raw: unknown): z.infer<typeof programSchema>[] {
  let arr: unknown;
  try {
    arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw badRequest('Data jenjang dan program studi tidak valid');
  }
  const r = z.array(programSchema).min(1, 'Tambahkan minimal satu program studi').max(50, 'Terlalu banyak program studi').safeParse(arr);
  if (!r.success) throw badRequest(r.error.issues.map((i) => `programs.${i.path.join('.')}: ${i.message}`).join('; '));
  const seen = new Set<string>();
  for (const p of r.data) {
    const k = `${p.levelId}:${p.programNameId}`;
    if (seen.has(k)) throw badRequest('Ada program studi dengan jenjang yang sama lebih dari sekali');
    seen.add(k);
  }
  return r.data;
}

export function uppsRegistrationRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  // ---- registrasi publik ----
  mountWith(router, auth, API_ROUTES.register, [regUploadSafe], async (req, res) => {
    const b = parse(registerSchema, req.body);
    const programs = parsePrograms((req.body as Record<string, unknown>).programs);
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    const photo = files.photo?.[0];
    const sppa = files.sppa?.[0];
    const spsu = files.spsu?.[0];
    if (!sppa) throw badRequest('Surat Pengajuan Permohonan Akun wajib diunggah');
    if (!spsu) throw badRequest('Surat Pernyataan sebagai UPPS oleh Pimpinan Perguruan Tinggi wajib diunggah');
    for (const [kind, f] of [['sppa', sppa], ['spsu', spsu]] as const) {
      if (f.size > MAX_PDF_BYTES) throw badRequest(`${KIND_LABEL[kind]} melebihi 1 MB`);
      if (!isPdf(f.buffer)) throw badRequest(`${KIND_LABEL[kind]} harus berupa berkas PDF`);
    }
    if (photo) {
      if (photo.size > MAX_PHOTO_BYTES) throw badRequest('Foto penanggung jawab melebihi 500 KB');
      if (!isJpeg(photo.buffer)) throw badRequest('Foto penanggung jawab harus berupa berkas JPG/JPEG');
    }

    const email = b.email.toLowerCase();
    if (await q1(ctx.pool, 'SELECT 1 FROM users WHERE email = $1', [email])) throw conflict('Surel sudah terdaftar');
    if (!(await q1(ctx.pool, 'SELECT 1 FROM institutions WHERE id=$1', [b.institutionId]))) throw badRequest('Institusi tidak ditemukan');
    const levelIds = [...new Set(programs.map((p) => p.levelId))];
    const nameIds = [...new Set(programs.map((p) => p.programNameId))];
    const okLevels = (await q(ctx.pool, 'SELECT id FROM levels WHERE id = ANY($1::smallint[])', [levelIds])).length;
    const okNames = (await q(ctx.pool, 'SELECT id FROM program_names WHERE id = ANY($1::int[])', [nameIds])).length;
    if (okLevels !== levelIds.length) throw badRequest('Jenjang tidak valid');
    if (okNames !== nameIds.length) throw badRequest('Program studi tidak valid');

    // Enkripsi + unggah ke IPFS di luar transaksi SQL.
    const passwordHash = await hashPassword(b.password);
    const store = (f: Express.Multer.File, kind: Kind, mime: string): Promise<StoredBlob & { fileName: string; mime: string }> =>
      encryptAndStore(ctx, f.buffer, `${kind}.bin`).then((s) => ({ ...s, fileName: sanitizeFileName(f.originalname), mime }));
    const [sPhoto, sSppa, sSpsu] = await Promise.all([photo ? store(photo, 'photo', 'image/jpeg') : null, store(sppa, 'sppa', 'application/pdf'), store(spsu, 'spsu', 'application/pdf')]);
    const insertFile = async (c: Parameters<typeof q1>[0], f: NonNullable<typeof sPhoto>) =>
      (
        await q1<{ id: string }>(
          c,
          `INSERT INTO stored_files (file_name, mime_type, size_bytes, sha256_plain, cid, wrapped_dek, dek_iv, dek_tag, file_iv, file_tag)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [f.fileName, f.mime, f.sizeBytes, f.sha256, f.cid, f.wrappedDek, f.dekIv, f.dekTag, f.fileIv, f.fileTag],
        )
      )!.id;

    try {
      await withTransaction(async (c) => {
        const userId = randomUUID();
        await insertUserRow(c, { id: userId, email, passwordHash, fullName: b.picName, role: 'upps', institutionId: b.institutionId, status: 'pending_verification' });
        const photoId = sPhoto ? await insertFile(c, sPhoto) : null;
        const sppaId = await insertFile(c, sSppa!);
        const spsuId = await insertFile(c, sSpsu!);
        const reg = await q1<{ id: string }>(
          c,
          `INSERT INTO upps_registrations (user_id, upps_name, leader_name, pic_name, phone, photo_file_id, sppa_file_id, spsu_file_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [userId, b.uppsName, b.leaderName, b.picName, b.phone ?? null, photoId, sppaId, spsuId],
        );
        let pos = 0;
        for (const p of programs) {
          await c.query(
            `INSERT INTO upps_registration_programs (registration_id, level_id, program_name_id, head_name, location, lat, lng, position)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [reg!.id, p.levelId, p.programNameId, p.headName ?? null, p.location ?? null, p.lat ?? null, p.lng ?? null, pos++],
          );
        }
      }, ctx.pool);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw conflict('Surel sudah terdaftar');
      throw err;
    }
    res.status(201).json(envelope({ status: 'pending_verification' as const }));
  });

  // ---- verifikasi oleh Sekretariat Administrasi (O) ----
  const SELECT_REG = `
    SELECT r.id, r.user_id, r.upps_name, r.leader_name, r.pic_name, r.phone, r.status, r.review_note, r.reviewed_at, r.created_at,
           u.email, u.institution_id, i.name AS institution_name, rv.full_name AS reviewed_by_name,
           (SELECT count(*)::int FROM upps_registration_programs p WHERE p.registration_id = r.id) AS program_count,
           r.photo_file_id IS NOT NULL AS has_photo
      FROM upps_registrations r
      JOIN users u ON u.id = r.user_id
      JOIN institutions i ON i.id = u.institution_id
      LEFT JOIN users rv ON rv.id = r.reviewed_by`;

  mount(router, auth, API_ROUTES.listUppsRegistrations, async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (status && !['pending_verification', 'approved', 'rejected'].includes(status)) throw badRequest('Status tidak valid');
    const rows = await q(ctx.pool, `${SELECT_REG} ${status ? 'WHERE r.status = $1' : ''}
      ORDER BY (r.status = 'pending_verification') DESC, r.created_at DESC LIMIT 500`, status ? [status] : []);
    res.json(envelope(rows.map(camel)));
  });

  const loadDetail = async (id: string) => {
    const reg = await q1(ctx.pool, `${SELECT_REG} WHERE r.id = $1`, [id]);
    if (!reg) throw notFound('Registrasi tidak ditemukan');
    const programs = await q(
      ctx.pool,
      `SELECT p.id, p.level_id, l.code AS level_code, l.label AS level_label, p.program_name_id, n.name AS program_name, p.head_name, p.location, p.lat, p.lng
         FROM upps_registration_programs p JOIN levels l ON l.id = p.level_id JOIN program_names n ON n.id = p.program_name_id
        WHERE p.registration_id = $1 ORDER BY p.position`,
      [id],
    );
    const fileRows = await q(
      ctx.pool,
      `SELECT 'photo' AS kind, f.file_name, f.mime_type, f.size_bytes, f.sha256_plain FROM upps_registrations r JOIN stored_files f ON f.id = r.photo_file_id WHERE r.id=$1
       UNION ALL SELECT 'sppa', f.file_name, f.mime_type, f.size_bytes, f.sha256_plain FROM upps_registrations r JOIN stored_files f ON f.id = r.sppa_file_id WHERE r.id=$1
       UNION ALL SELECT 'spsu', f.file_name, f.mime_type, f.size_bytes, f.sha256_plain FROM upps_registrations r JOIN stored_files f ON f.id = r.spsu_file_id WHERE r.id=$1`,
      [id],
    );
    const files = fileRows.map((f) => ({ kind: f.kind, label: KIND_LABEL[f.kind as Kind], fileName: f.file_name, mimeType: f.mime_type, sizeBytes: Number(f.size_bytes), sha256: String(f.sha256_plain).trim() }));
    return { ...camel(reg), programs: programs.map(camel), files };
  };

  mount(router, auth, API_ROUTES.getUppsRegistration, async (req, res) => {
    res.json(envelope(await loadDetail(uuidParam(req.params.id))));
  });

  mount(router, auth, API_ROUTES.downloadUppsRegistrationFile, async (req, res) => {
    const id = uuidParam(req.params.id);
    const kind = String(req.params.kind) as Kind;
    if (!(kind in KIND_COLUMN)) throw badRequest('Jenis berkas tidak valid');
    const file = await q1(
      ctx.pool,
      `SELECT f.* FROM upps_registrations r JOIN stored_files f ON f.id = r.${KIND_COLUMN[kind]} WHERE r.id = $1`,
      [id],
    );
    if (!file) throw notFound('Berkas tidak ditemukan');
    const plain = await fetchAndDecrypt(ctx, file);
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFileName(file.file_name)}"`);
    res.setHeader('X-Content-Sha256', String(file.sha256_plain).trim());
    res.setHeader('X-Integrity-Verified', 'true');
    res.send(plain);
  });

  const decisionSchema = z
    .object({ result: z.enum(['approved', 'rejected']), note: z.string().trim().max(1000).optional() })
    .refine((v) => v.result !== 'rejected' || (v.note && v.note.length >= 3), { message: 'Catatan wajib diisi bila pendaftaran ditolak', path: ['note'] });

  mount(router, auth, API_ROUTES.decideUppsRegistration, async (req, res) => {
    const id = uuidParam(req.params.id);
    const b = parse(decisionSchema, req.body);
    const reviewer = req.user!;
    const reg = await q1<{ user_id: string; status: string; institution_id: string }>(
      ctx.pool,
      `SELECT r.user_id, r.status, u.institution_id FROM upps_registrations r JOIN users u ON u.id = r.user_id WHERE r.id = $1`,
      [id],
    );
    if (!reg) throw notFound('Registrasi tidak ditemukan');
    if (reg.status !== 'pending_verification') throw conflict('Registrasi ini sudah diputuskan sebelumnya');

    if (b.result === 'rejected') {
      await withTransaction(async (c) => {
        const upd = await q1(c, `UPDATE upps_registrations SET status='rejected', review_note=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$1 AND status='pending_verification' RETURNING id`, [id, b.note, reviewer.id]);
        if (!upd) throw conflict('Registrasi ini sudah diputuskan sebelumnya');
        await c.query(`UPDATE users SET status='rejected', is_active=false WHERE id=$1`, [reg.user_id]);
      }, ctx.pool);
      return void res.json(envelope({ id, status: 'rejected' as const }));
    }

    // Setujui: enroll identitas Fabric lebih dulu; bila gagal, tidak ada yang berubah.
    let identity: EnrolledIdentity;
    try {
      identity = await enrollIdentity({ enrollmentId: enrollmentIdFor('upps', reg.user_id), fabricRole: 'upps', uid: reg.user_id, allowExisting: true });
    } catch (err) {
      logger.error({ err, registrationId: id }, 'enroll identitas Fabric gagal saat menyetujui registrasi UPPS');
      throw new AppError(503, 'FABRIC_ENROLL_FAILED', 'Identitas jaringan untuk akun ini belum dapat dibuat karena layanan jaringan sedang tidak tersedia. Pendaftaran belum disetujui; silakan coba lagi sebentar lagi.');
    }
    await withTransaction(async (c) => {
      const upd = await q1(c, `UPDATE upps_registrations SET status='approved', review_note=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$1 AND status='pending_verification' RETURNING id`, [id, b.note ?? null, reviewer.id]);
      if (!upd) throw conflict('Registrasi ini sudah diputuskan sebelumnya');
      await c.query(
        `INSERT INTO study_programs (institution_id, name, level, head_name, location, lat, lng)
         SELECT $2, n.name, l.code, p.head_name, p.location, p.lat, p.lng
           FROM upps_registration_programs p JOIN levels l ON l.id = p.level_id JOIN program_names n ON n.id = p.program_name_id
          WHERE p.registration_id = $1
         ON CONFLICT (institution_id, name, level) DO UPDATE SET
           head_name = COALESCE(EXCLUDED.head_name, study_programs.head_name),
           location = COALESCE(EXCLUDED.location, study_programs.location),
           lat = COALESCE(EXCLUDED.lat, study_programs.lat),
           lng = COALESCE(EXCLUDED.lng, study_programs.lng)`,
        [id, reg.institution_id],
      );
      await storeIdentity(c, reg.user_id, identity);
      await c.query(`UPDATE users SET status='active', is_active=true WHERE id=$1`, [reg.user_id]);
    }, ctx.pool);
    res.json(envelope({ id, status: 'approved' as const }));
  });
}
