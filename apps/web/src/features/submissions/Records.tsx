import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, PencilLine } from 'lucide-react';
import { ACCREDITATION_RANKS, INDIVIDUAL_RECORD_TYPES, NON_CORRECTABLE_RECORD_TYPES } from '@akreditasi/shared';
import { z } from 'zod';
import { api, errorMessage } from '../../api/client';
import type { FormalRecordView, RecordHistoryItem, User } from '../../api/types';
import { Badge, Button, CopyableMono, DataTable, EmptyState, Field, FormError, Input, Modal, Notice, Select, Spinner, TechnicalDetails, Textarea } from '../../components/ui';
import { ProofStatus } from './AuditTable';
import { PAYLOAD_FIELD_LABEL, RANK_LABEL, RECORD_LABEL, RESULT_LABEL, fmtDate, fmtDateTime, roleName } from '../../lib/labels';
import { recordTime } from '../../lib/workflow';
import { useConfirmed } from '../common/forms';
import { useAction } from '../common/useAction';

export function canCorrect(r: FormalRecordView, user: User, records: FormalRecordView[] = [r]): boolean {
  if (records.some((o) => o.recordKey === r.recordKey && o.version > r.version)) return false;
  if (NON_CORRECTABLE_RECORD_TYPES.includes(r.recordType)) return false;
  // Hasil asesmen diperbaiki lewat halaman penilaian (skor rinci diubah, ringkasan dihitung ulang), bukan lewat isian catatan.
  if (r.recordType === 'ASSESSMENT_RESULT') return false;
  if (r.actorRole !== user.role) return false;
  if (INDIVIDUAL_RECORD_TYPES.includes(r.recordType)) return (r.actorUid ?? r.actorUserId) === user.id;
  return true;
}

const fieldLabel = (k: string) => PAYLOAD_FIELD_LABEL[k] ?? k;
const fmtVal = (k: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'rank') return RANK_LABEL[v as keyof typeof RANK_LABEL] ?? String(v);
  if (k === 'result' || k === 'response') return RESULT_LABEL[String(v)] ?? String(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

export function RecordsTable({ submissionId, records, user }: { submissionId: string; records: FormalRecordView[]; user: User }) {
  const [hist, setHist] = useState<FormalRecordView | null>(null);
  const [corr, setCorr] = useState<FormalRecordView | null>(null);
  if (!records.length) return <EmptyState title="Belum ada catatan resmi" icon={<History size={22} />}>Catatan resmi muncul di sini setelah tahap formal pertama dikirim. Seluruh catatan bersifat permanen.</EmptyState>;
  return (
    <>
      <DataTable rows={records} rowKey={(r) => r.id} caption="Catatan resmi"
        columns={[
          { key: 'j', header: 'Catatan', primary: true, cell: (r) => <div><div className="font-medium text-ink">{RECORD_LABEL[r.recordType] ?? r.recordType}</div><div className="text-[13px] text-faint">{r.version > 1 ? `Hasil koreksi, versi ${r.version}` : 'Versi asli'}</div></div> },
          { key: 'p', header: 'Dicatat oleh', cell: (r) => <div><div>{roleName(r.actorRole as string)}</div><div className="text-[13px] text-faint">{fmtDateTime(recordTime(r))}</div></div> },
          { key: 's', header: 'Bukti', cell: (r) => <ProofStatus status={r.status === 'pending_chain' ? 'pending' : r.status === 'failed' ? 'failed' : 'committed'} /> },
          { key: 't', header: 'Rincian teknis', cell: (r) => <TechnicalDetails items={[['Nomor transaksi', <CopyableMono key="t" value={r.txId} full />], ['Blok', r.blockNumber], ['Kunci catatan', <CopyableMono key="k" value={r.recordKey} full />]]} /> },
          { key: 'a', header: '', cell: (r) => (
            <div className="flex flex-wrap gap-1">
              <Button variant="ghost" size="sm" icon={<History size={15} />} onClick={() => setHist(r)}>Riwayat versi</Button>
              {canCorrect(r, user, records) && <Button variant="ghost" size="sm" icon={<PencilLine size={15} />} onClick={() => setCorr(r)}>Koreksi</Button>}
            </div>
          ) },
        ]} />
      <HistoryModal record={hist} onClose={() => setHist(null)} />
      {corr && <CorrectionModal record={corr} submissionId={submissionId} onClose={() => setCorr(null)} />}
    </>
  );
}

function HistoryModal({ record, onClose }: { record: FormalRecordView | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['history', record?.id], enabled: !!record, queryFn: async () => (await api.get<RecordHistoryItem[]>(`/formal-records/${record!.id}/history`)).data ?? [] });
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => (a.value?.version ?? 0) - (b.value?.version ?? 0)), [q.data]);
  return (
    <Modal open={!!record} onClose={onClose} wide footer={<Button onClick={onClose}>Tutup</Button>} title={`Riwayat versi: ${record ? RECORD_LABEL[record.recordType] ?? record.recordType : ''}`}>
      <p className="mb-4 text-sm text-muted">Setiap koreksi menambah versi baru. Versi sebelumnya tetap tersimpan dan tidak dapat dihapus.</p>
      {q.isLoading && <Spinner />}
      {q.isError && <FormError message={errorMessage(q.error)} />}
      <ol className="space-y-4">
        {rows.map((h, i) => {
          const prev = i > 0 ? rows[i - 1]?.value?.payload : undefined;
          const cur = h.value?.payload ?? {};
          const changed = prev ? Object.keys({ ...prev, ...cur }).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(cur[k])) : [];
          return (
            <li key={h.txId} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={h.value?.version === 1 ? 'info' : 'gold'}>{h.value?.version === 1 ? 'Versi asli' : `Versi ${h.value?.version ?? '?'}`}</Badge>
                <span className="text-sm text-muted">{fmtDateTime(h.timestamp)}</span>
              </div>
              {h.value?.lastWriter?.role && <p className="mt-2 text-sm">Dicatat oleh <b>{roleName(h.value.lastWriter.role)}</b></p>}
              {h.value?.correction && <div className="mt-2 text-sm"><p><b>Alasan koreksi:</b> {h.value.correction.reason}</p><p><b>Rujukan bukti:</b> {h.value.correction.evidenceRef}</p></div>}
              {changed.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                  {changed.map((k) => <li key={k}><b>{fieldLabel(k)}:</b> <span className="text-bad line-through">{fmtVal(k, prev?.[k])}</span> menjadi <span className="font-medium text-ok">{fmtVal(k, cur[k])}</span></li>)}
                </ul>
              )}
              <div className="mt-3"><TechnicalDetails items={[['Nomor transaksi', <CopyableMono key="t" value={h.txId} full />], ['Muatan lengkap', <pre key="p" className="max-h-60 overflow-auto rounded-lg bg-white p-2 font-mono text-xs">{JSON.stringify(cur, null, 2)}</pre>]]} /></div>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}

/** Isian yang boleh dikoreksi per jenis catatan; selain itu terkunci oleh chaincode dan hanya ditampilkan. */
const LOCKED_FIELDS: Record<string, string[]> = {
  ADMIN_VERIFICATION: ['documentSetVersion', 'result'],
  ASSIGNMENT_RESPONSE: ['offerSeq', 'responderRole'],
  FINAL_VERIFICATION: ['alRecordKey', 'akRecordKeys'],
  DECISION: ['totalScore', 'finalVerificationKey'],
};
const lockedText = (k: string, v: unknown): string => {
  if (k === 'akRecordKeys') return `${Array.isArray(v) ? v.length : 0} catatan hasil AK`;
  if (k === 'alRecordKey') return 'Catatan hasil AL';
  if (k === 'finalVerificationKey') return 'Catatan verifikasi akhir pengajuan ini';
  if (k === 'responderRole') return v === 'upps' ? 'UPPS' : 'Asesor';
  if (k === 'offerSeq') return `Penawaran urutan ${String(v)}`;
  return fmtVal(k, v);
};

const metaSchema = z.object({
  reason: z.string().trim().min(5, 'Alasan koreksi wajib diisi (minimal 5 huruf)'),
  evidenceRef: z.string().trim().min(3, 'Rujukan bukti wajib diisi'),
});

/** Teks catatan yang tersimpan off-chain (catatan verifikasi, alasan tanggapan); null bila tidak tersedia bagi pengguna. */
const originalText = (r: FormalRecordView): string | null => {
  const oc = r.offChain;
  if (!oc) return null;
  if (r.recordType === 'ASSIGNMENT_RESPONSE') return (r.version > 1 ? oc.responseReason : oc.reason) ?? '';
  return oc.notes ?? '';
};

function CorrectionModal({ record, submissionId, onClose }: { record: FormalRecordView; submissionId: string; onClose: () => void }) {
  const type = record.recordType;
  const p = record.payload as Record<string, any>;
  const locked = LOCKED_FIELDS[type] ?? [];
  const textKnown = originalText(record) !== null;
  const [text, setText] = useState(originalText(record) ?? '');
  const [textTouched, setTextTouched] = useState(false);
  const [rank, setRank] = useState<string>(String(p.rank ?? 'BAIK'));
  const [decree, setDecree] = useState<string>(String(p.decreeNumber ?? ''));
  const [validFrom, setValidFrom] = useState<string>(p.validFrom ?? '');
  const [validUntil, setValidUntil] = useState<string>(p.validUntil ?? '');
  const [response, setResponse] = useState<string>(String(p.response ?? 'ACCEPT'));
  const [reason, setReason] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);

  const mut = useAction((body: unknown) => api.post(`/formal-records/${record.id}/corrections`, body), { title: 'Koreksi catatan telah dikirim', submissionId, onDone: onClose });
  const confirm = useConfirmed<{ body: Record<string, unknown>; changes: [string, string][] }>({
    run: (v) => mut.mutate(v.body), pending: mut.isPending,
    title: 'Kirim koreksi catatan resmi?', confirmLabel: 'Ya, kirim koreksi',
    summary: (v) => [['Catatan', RECORD_LABEL[type] ?? type], ['Menjadi versi', record.version + 1], ...v.changes, ['Alasan koreksi', reason], ['Rujukan bukti', evidenceRef]],
  });

  const textLabel = type === 'ASSIGNMENT_RESPONSE' ? 'Alasan tanggapan' : type === 'FINAL_VERIFICATION' ? 'Catatan verifikasi akhir' : 'Catatan verifikasi kelengkapan';
  const textRequired = (type === 'ADMIN_VERIFICATION' && p.result !== 'APPROVED') || (type === 'ASSIGNMENT_RESPONSE' && response === 'REJECT');

  const submit = () => {
    const e: Record<string, string> = {};
    const payload: Record<string, unknown> = { ...p };
    const changes: [string, string][] = [];
    const body: Record<string, unknown> = {};
    if (type === 'DECISION') {
      const none = rank === 'TIDAK_TERAKREDITASI';
      if (decree.trim().length < 3) e.decree = 'Nomor Surat Keputusan wajib diisi';
      if (!none) {
        if (!validFrom) e.validFrom = 'Tanggal mulai berlaku wajib diisi';
        if (!validUntil) e.validUntil = 'Tanggal berakhir wajib diisi';
        if (validFrom && validUntil && validUntil <= validFrom) e.validUntil = 'Tanggal berakhir harus setelah tanggal mulai';
      }
      payload.rank = rank; payload.decreeNumber = decree.trim(); payload.validFrom = none ? null : validFrom; payload.validUntil = none ? null : validUntil;
      if (rank !== p.rank) changes.push(['Peringkat', `${RANK_LABEL[p.rank as keyof typeof RANK_LABEL] ?? p.rank} menjadi ${RANK_LABEL[rank as keyof typeof RANK_LABEL] ?? rank}`]);
      if (decree.trim() !== p.decreeNumber) changes.push(['Nomor Surat Keputusan', `${p.decreeNumber} menjadi ${decree.trim()}`]);
      if ((payload.validFrom ?? null) !== (p.validFrom ?? null) || (payload.validUntil ?? null) !== (p.validUntil ?? null)) changes.push(['Masa berlaku', payload.validFrom ? `${fmtDate(String(payload.validFrom))} s.d. ${fmtDate(String(payload.validUntil))}` : 'Tidak ada']);
    } else {
      if (textRequired && text.trim().length < 3) e.text = type === 'ASSIGNMENT_RESPONSE' ? 'Alasan penolakan wajib diisi' : 'Catatan wajib diisi untuk hasil perbaikan atau penolakan';
      if (type === 'ASSIGNMENT_RESPONSE') {
        payload.response = response;
        if (response !== p.response) changes.push(['Tanggapan', `${RESULT_LABEL[p.response] ?? p.response} menjadi ${RESULT_LABEL[response] ?? response}`]);
      }
      const orig = originalText(record) ?? '';
      if (textTouched || !textKnown) {
        if (type === 'ASSIGNMENT_RESPONSE') body.responseReason = text.trim(); else body.notes = text.trim();
        if (text.trim() !== orig.trim()) changes.push([textLabel, text.trim() || '—']);
      }
    }
    const m = metaSchema.safeParse({ reason, evidenceRef });
    if (!m.success) for (const i of m.error.issues) e[String(i.path[0])] = i.message;
    if (!changes.length && !Object.keys(e).length) e.nochange = 'Belum ada isian yang diubah. Ubah sedikitnya satu isian sebelum mengirim koreksi.';
    setErrs(e);
    if (Object.keys(e).length) { setFormErr(e.nochange ?? 'Periksa kembali isian yang ditandai.'); return; }
    setFormErr(null);
    confirm.ask({ body: { ...body, payload, reason: reason.trim(), evidenceRef: evidenceRef.trim(), expectedVersion: record.version }, changes });
  };

  const none = rank === 'TIDAK_TERAKREDITASI';
  return (
    <Modal open onClose={onClose} wide title={`Koreksi: ${RECORD_LABEL[type] ?? type}`}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button onClick={submit} loading={mut.isPending}>Lanjut ke konfirmasi</Button></>}>
      <div className="space-y-5">
        <Notice tone="chain" title="Koreksi menambah versi baru">Catatan asli tetap tersimpan dan dapat dilihat pada Riwayat versi. Sebutkan alasan dan rujukan bukti yang dapat diperiksa.</Notice>
        <FormError message={formErr} />
        <fieldset className="space-y-3">
          <legend className="mb-2 text-[15px] font-medium">1. Ubah isi catatan</legend>
          {locked.length > 0 && (
            <dl className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Tidak dapat diubah</p>
              {locked.filter((k) => k in p).map((k) => <div key={k} className="grid gap-x-3 py-0.5 sm:grid-cols-[minmax(0,30%)_minmax(0,1fr)]"><dt className="text-muted">{fieldLabel(k)}</dt><dd className="text-ink">{lockedText(k, p[k])}</dd></div>)}
            </dl>
          )}
          {type === 'DECISION' && (
            <>
              <Field label="Peringkat" required>{(f) => <Select {...f} value={rank} onChange={(e) => setRank(e.target.value)}>{ACCREDITATION_RANKS.map((r) => <option key={r} value={r}>{RANK_LABEL[r]}</option>)}</Select>}</Field>
              <Field label="Nomor Surat Keputusan" required error={errs.decree}>{(f) => <Input {...f} value={decree} onChange={(e) => setDecree(e.target.value)} />}</Field>
              <Field label="Berlaku sejak" required={!none} error={errs.validFrom}>{(f) => <Input {...f} type="date" disabled={none} value={none ? '' : validFrom} onChange={(e) => setValidFrom(e.target.value)} />}</Field>
              <Field label="Berlaku sampai" required={!none} error={errs.validUntil}>{(f) => <Input {...f} type="date" disabled={none} value={none ? '' : validUntil} onChange={(e) => setValidUntil(e.target.value)} />}</Field>
            </>
          )}
          {type === 'ASSIGNMENT_RESPONSE' && (
            <Field label="Tanggapan" hint="Tanggapan hanya dapat diubah selama penawaran masih menunggu tanggapan; sesudahnya hanya alasan yang dapat dikoreksi.">
              {(f) => <Select {...f} value={response} onChange={(e) => setResponse(e.target.value)}><option value="ACCEPT">Menerima</option><option value="REJECT">Menolak</option></Select>}
            </Field>
          )}
          {type !== 'DECISION' && (
            <Field label={textLabel} required={textRequired} error={errs.text} hint={!textKnown ? 'Teks aslinya tidak tersedia bagi Bapak/Ibu. Isi teks yang benar; teks lama akan digantikan.' : 'Teks diubah di sini; sidik jari (hash) dihitung otomatis oleh sistem.'}>
              {(f) => <Textarea {...f} rows={4} value={text} onChange={(e) => { setText(e.target.value); setTextTouched(true); }} />}
            </Field>
          )}
        </fieldset>
        <div className="space-y-4">
          <h3 className="text-[15px] font-medium">2. Alasan dan bukti</h3>
          <Field label="Alasan koreksi" required error={errs.reason}>{(f) => <Textarea {...f} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <Field label="Rujukan bukti" required error={errs.evidenceRef} hint="Misalnya nomor surat, tautan, atau nama dokumen pendukung.">{(f) => <Input {...f} value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} />}</Field>
          <p className="text-sm text-muted">Koreksi ini akan menjadi versi {record.version + 1} dari catatan ini. Nomor versi diisi otomatis oleh sistem.</p>
        </div>
      </div>
      {confirm.dialog}
    </Modal>
  );
}
