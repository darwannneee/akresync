import { randomBytes } from 'node:crypto';
import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { API_ROUTES } from '@akreditasi/shared';
import { loadSubmissionForUser } from '../auth/rbac.js';
import type { AppContext } from '../context.js';
import { auditReceipt, recordAuditEvent } from '../db/outbox.js';
import { q1, withTransaction } from '../db/pool.js';
import { badRequest, conflict } from '../errors.js';
import { assertFlow, stateOf } from '../flow.js';
import { envelope, mount, mountWith, parse, uuidParam } from '../lib/http.js';
import { camel, docDto, encryptAndStore, insertDocumentRow, requireFile, upload } from './common.js';

export function paymentRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  mount(router, auth, API_ROUTES.issueInvoice, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const b = parse(z.object({ amount: z.coerce.number().positive().max(1_000_000_000_000) }), req.body);
    const out = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, id, { forUpdate: true });
      assertFlow('issue_invoice', stateOf(sub));
      const invoiceNo = `INV-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
      const p = await q1(c, `INSERT INTO payments (submission_id, invoice_no, amount, issued_by) VALUES ($1,$2,$3,$4) RETURNING *`, [id, invoiceNo, b.amount, user.id]);
      await c.query(`UPDATE submissions SET stage='invoice_issued', updated_at=now() WHERE id=$1`, [id]);
      const ev = await recordAuditEvent(c, { aggregateType: 'payment', aggregateId: p!.id, submissionId: id, kind: 'InvoiceIssued', version: p!.version, snapshot: p!, actor: { uid: user.id, role: user.role } });
      return { p: p!, ev };
    }, ctx.pool);
    res.status(201).json(envelope({ ...camel(out.p), amount: Number(out.p.amount) }, { audit: auditReceipt([out.ev]) }));
  });

  mountWith(router, auth, API_ROUTES.uploadPaymentProof, [upload.single('file')], async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const file = requireFile(req.file);
    const pre = await loadSubmissionForUser(ctx.pool, user, id);
    assertFlow('upload_payment_proof', stateOf(pre));
    const blob = await encryptAndStore(ctx, file.buffer, file.originalname);
    const out = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, id, { forUpdate: true });
      assertFlow('upload_payment_proof', stateOf(sub));
      const pay = await q1(c, `SELECT * FROM payments WHERE submission_id=$1 AND status IN ('issued','rejected') ORDER BY issued_at DESC LIMIT 1`, [id]);
      if (!pay) throw conflict('Tidak ada tagihan yang menunggu bukti bayar');
      const doc = await insertDocumentRow(c, { submissionId: id, setVersion: sub.document_set_version, docType: 'PAYMENT_PROOF', fileName: file.originalname, mimeType: file.mimetype, blob, uploadedBy: user.id });
      const p = await q1(c, `UPDATE payments SET status='proof_uploaded', proof_document_id=$2, proof_uploaded_at=now(), version=version+1 WHERE id=$1 RETURNING *`, [pay.id, doc.id]);
      await c.query(`UPDATE submissions SET stage='payment_proof_uploaded', updated_at=now() WHERE id=$1`, [id]);
      const actor = { uid: user.id, role: user.role };
      const e1 = await recordAuditEvent(c, { aggregateType: 'document_version', aggregateId: doc.id, submissionId: id, kind: 'DocumentVersionSaved', version: sub.document_set_version, snapshot: doc, actor });
      const e2 = await recordAuditEvent(c, { aggregateType: 'payment', aggregateId: p!.id, submissionId: id, kind: 'PaymentProofUploaded', version: p!.version, snapshot: p!, actor });
      return { p: p!, doc, ids: [e1, e2] };
    }, ctx.pool);
    res.status(201).json(envelope({ payment: { ...camel(out.p), amount: Number(out.p.amount) }, document: docDto(out.doc) }, { audit: auditReceipt(out.ids) }));
  });

  mount(router, auth, API_ROUTES.verifyPayment, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const b = parse(z.object({ result: z.enum(['verified', 'rejected']), notes: z.string().trim().max(5000).optional() }), req.body);
    if (b.result === 'rejected' && !b.notes) throw badRequest('Catatan wajib diisi saat menolak pembayaran');
    const out = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, id, { forUpdate: true });
      assertFlow('verify_payment', stateOf(sub));
      const pay = await q1(c, `SELECT * FROM payments WHERE submission_id=$1 AND status='proof_uploaded' ORDER BY issued_at DESC LIMIT 1`, [id]);
      if (!pay) throw conflict('Tidak ada bukti bayar yang menunggu verifikasi');
      const p = await q1(c, `UPDATE payments SET status=$2, verified_by=$3, verified_at=now(), notes=$4, version=version+1 WHERE id=$1 RETURNING *`, [pay.id, b.result, user.id, b.notes ?? null]);
      await c.query(`UPDATE submissions SET stage=$2, updated_at=now() WHERE id=$1`, [id, b.result === 'verified' ? 'payment_verified' : 'invoice_issued']);
      const ev = await recordAuditEvent(c, {
        aggregateType: 'payment', aggregateId: p!.id, submissionId: id, kind: b.result === 'verified' ? 'PaymentVerified' : 'PaymentRejected',
        version: p!.version, snapshot: p!, actor: { uid: user.id, role: user.role },
      });
      return { p: p!, ev };
    }, ctx.pool);
    res.json(envelope({ ...camel(out.p), amount: Number(out.p.amount) }, { audit: auditReceipt([out.ev]) }));
  });
}
