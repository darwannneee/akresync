import { CalendarDays, Download, Link2, ScrollText, Users } from 'lucide-react';
import { MAX_TOTAL_SCORE } from '@akreditasi/shared';
import type { AuditEventView, SubmissionDetail } from '../../api/types';
import { Badge, Button, Card, CopyableMono, DataTable, DL, EmptyState, Notice, ProofBadge, TechnicalDetails } from '../../components/ui';
import {
  ASSESS_STATUS_LABEL, AUDIT_KIND_LABEL, MODE_LABEL, OFFER_STATUS_LABEL, PAYMENT_STATUS_LABEL, PHASE_LABEL, RECORD_LABEL, RESPONSE_LABEL, SCHEDULE_STATUS_LABEL,
  fmtDateRange, fmtDateTime, fmtNumber, fmtRupiah, rankLabel, roleName,
} from '../../lib/labels';
import { recordTime } from '../../lib/workflow';
import { useDownload } from '../common/useAction';
import { MetricsCard } from './AuditTable';
import { AiProgressCard } from '../ai/ProgressCard';
import { AiBanner, TotalsView } from '../ai/parts';


/** Ubah pesan galat chaincode menjadi kalimat untuk pengguna akademik (tanpa kode teknis). */
function plainChainError(raw: string): string {
  const msg = raw.replace(/^[A-Z_]+:\s*/, '').replace(/\s*\([^)]*\)/g, '').trim();
  const sentence = msg.charAt(0).toUpperCase() + msg.slice(1);
  return /^FORBIDDEN/.test(raw) ? `Ditolak karena kewenangan: ${msg}` : sentence;
}

export function DecisionSummary({ s }: { s: SubmissionDetail }) {
  const download = useDownload();
  const dec = s.records?.filter((r) => r.recordType === 'DECISION').slice(-1)[0];
  const p = dec?.payload as { rank?: string; decreeNumber?: string; validFrom?: string | null; validUntil?: string | null; totalScore?: number } | undefined;
  if (!p && !s.certificate) return null;
  return (
    <Card title="Keputusan akreditasi" actions={<Badge tone="chain" icon={<Link2 size={13} />}>Tercatat permanen</Badge>}>
      {p && <DL items={[['Peringkat', <b key="r" className="text-xl text-navy-900">{rankLabel(p.rank)}</b>], ['Nomor Surat Keputusan', p.decreeNumber], ['Skor total', fmtNumber(p.totalScore)], ['Masa berlaku', p.validFrom ? fmtDateRange(p.validFrom, p.validUntil ?? undefined) : 'Tidak ada']]} />}
      <div className="mt-4">
        {s.certificate
          ? <Button icon={<Download size={16} />} onClick={() => download(`/certificates/${s.certificate!.id}/download`, `sertifikat-${s.certificate!.certificateNo}.pdf`)}>Unduh sertifikat ({s.certificate.certificateNo})</Button>
          : <Notice tone="info">Sertifikat belum diterbitkan oleh Sekretariat Administrasi.</Notice>}
      </div>
    </Card>
  );
}

export function SummaryTab({ s, showMetrics }: { s: SubmissionDetail; showMetrics: boolean }) {
  const pay = s.payments?.[0];
  return (
    <div className="space-y-5">
      <DecisionSummary s={s} />
      {s.aiScore && <Card title="Skor AI sementara" description="Hasil analisis AI (pendukung, bukan nilai resmi)"><AiBanner /><div className="mt-4"><TotalsView totals={s.aiScore.totals} /></div></Card>}
      {s.aiProgress && s.aiProgress.phase !== 'done' && <AiProgressCard p={s.aiProgress} />}
      {pay && (
        <Card title="Tagihan">
          <DL items={[['Nomor tagihan', pay.invoiceNo], ['Jumlah', fmtRupiah(pay.amount)], ['Status', <Badge key="b" tone={pay.status === 'verified' ? 'success' : pay.status === 'rejected' ? 'danger' : 'info'}>{PAYMENT_STATUS_LABEL[pay.status] ?? pay.status}</Badge>], ['Diterbitkan', fmtDateTime(pay.issuedAt)], ['Catatan', pay.notes]]} />
        </Card>
      )}
      {!!s.rejectedAttempts?.length && (
        <Notice tone="warn" title="Percobaan pencatatan yang tidak diterima">
          <ul className="mt-1 list-disc pl-5">{s.rejectedAttempts.map((a) => <li key={a.id}>{RECORD_LABEL[a.recordType] ?? a.recordType}{a.createdAt ? `, ${fmtDateTime(a.createdAt)}` : ''}{a.error ? `. ${plainChainError(a.error)}` : ''}</li>)}</ul>
          <p className="mt-1">Percobaan ini tidak tercatat dan tidak mengubah status pengajuan.</p>
        </Notice>
      )}
      {showMetrics && <Card title="Ukuran pencatatan"><MetricsCard submissionId={s.id} /></Card>}
    </div>
  );
}

export function AssignmentsTab({ s }: { s: SubmissionDetail }) {
  const offers = s.offers ?? [];
  const assessments = s.assessments ?? [];
  const responses = s.responses ?? [];
  if (!offers.length && !assessments.length && !responses.length) return <EmptyState title="Belum ada penugasan" icon={<Users size={22} />}>Penawaran asesor dan hasil penilaian akan tampil di sini setelah pembayaran terverifikasi.</EmptyState>;
  return (
    <div className="space-y-6">
      {offers.length > 0 && (
        <section><h3 className="mb-3 text-lg font-medium">Penawaran pasangan asesor</h3>
          <DataTable rows={offers} rowKey={(o) => o.id} caption="Penawaran asesor" columns={[
            { key: 'n', header: 'Penawaran', primary: true, cell: (o) => `Ke-${o.offerNo}` },
            { key: 'a', header: 'Asesor', cell: (o) => `${o.assessor1Name ?? o.assessor1Id}; ${o.assessor2Name ?? o.assessor2Id}` },
            { key: 'l', header: 'Ketua', cell: (o) => o.leadAssessorName ?? o.leadAssessorId },
            { key: 's', header: 'Status', cell: (o) => <Badge tone={o.status === 'effective' ? 'success' : o.status === 'rejected' ? 'danger' : 'info'}>{OFFER_STATUS_LABEL[o.status] ?? o.status}</Badge> },
            { key: 'r', header: 'Tanggapan', cell: (o) => <span className="text-sm">Asesor 1: {o.assessor1Response ? RESPONSE_LABEL[o.assessor1Response] : 'belum'}; Asesor 2: {o.assessor2Response ? RESPONSE_LABEL[o.assessor2Response] : 'belum'}; UPPS: {o.uppsResponse ? RESPONSE_LABEL[o.uppsResponse] : 'belum'}{o.rejectionReason && <><br />Alasan penolakan: {o.rejectionReason}</>}</span> },
          ]} />
        </section>
      )}
      {assessments.length > 0 && (
        <section><h3 className="mb-3 text-lg font-medium">Hasil penilaian</h3>
          <DataTable rows={assessments} rowKey={(a) => a.id} caption="Hasil penilaian" columns={[
            { key: 'a', header: 'Asesor', primary: true, cell: (a) => a.assessorName ?? a.assessorId },
            { key: 'p', header: 'Jenis', cell: (a) => PHASE_LABEL[a.phase] },
            { key: 's', header: 'Status', cell: (a) => <Badge tone={a.status === 'submitted' ? 'success' : 'warn'}>{ASSESS_STATUS_LABEL[a.status]}</Badge> },
            { key: 't', header: `Skor total (0 sampai ${fmtNumber(MAX_TOTAL_SCORE)})`, align: 'right', cell: (a) => <b>{fmtNumber(a.totalScore)}</b> },
          ]} />
        </section>
      )}
      {responses.length > 0 && (
        <section><h3 className="mb-3 text-lg font-medium">Tanggapan atas hasil asesmen</h3>
          <ul className="space-y-3">{responses.map((r) => <li key={r.id} className="rounded-lg border border-line bg-white p-4"><p className="text-sm text-muted">{r.responderRole === 'upps' ? 'UPPS' : 'Ketua asesor'} · {RESPONSE_LABEL[r.responseType]} · {fmtDateTime(r.createdAt)}</p><p className="mt-1 text-base">{r.body}</p></li>)}</ul>
        </section>
      )}
    </div>
  );
}

export function ScheduleTab({ s }: { s: SubmissionDetail }) {
  const list = s.alSchedules ?? [];
  if (!list.length) return <EmptyState title="Jadwal belum diusulkan" icon={<CalendarDays size={22} />}>KEA mengusulkan jadwal Asesmen Lapangan, lalu Sekretariat Administrasi memutuskannya.</EmptyState>;
  return (
    <DataTable rows={list} rowKey={(x) => x.id} caption="Jadwal Asesmen Lapangan" columns={[
      { key: 'v', header: 'Usulan', primary: true, cell: (x) => `Usulan ke-${x.version}` },
      { key: 'd', header: 'Pelaksanaan', cell: (x) => fmtDateRange(x.startDate, x.endDate) },
      { key: 'l', header: 'Lokasi', cell: (x) => x.location },
      { key: 'm', header: 'Moda', cell: (x) => MODE_LABEL[x.mode] ?? x.mode },
      { key: 's', header: 'Status', cell: (x) => <Badge tone={x.status === 'approved' ? 'success' : x.status === 'rejected' ? 'danger' : 'warn'}>{SCHEDULE_STATUS_LABEL[x.status] ?? x.status}</Badge> },
      { key: 'n', header: 'Catatan', cell: (x) => x.notes ?? '—' },
    ]} />
  );
}

/** Linimasa gabungan catatan resmi dan peristiwa audit. */
export function ActivityTimeline({ s, audit }: { s: SubmissionDetail; audit: AuditEventView[] }) {
  type Item = { key: string; when: string; title: string; role: string; kind: 'chain' | 'audit'; txId?: string | null; block?: string | number | null; status?: AuditEventView['status']; version?: number };
  const items: Item[] = [
    ...(s.records ?? []).map((r) => ({ key: `r${r.id}`, when: recordTime(r) ?? '', title: `${RECORD_LABEL[r.recordType] ?? r.recordType}${r.version > 1 ? ' (koreksi)' : ''}`, role: roleName(r.actorRole as string), kind: 'chain' as const, txId: r.txId, block: r.blockNumber, version: r.version })),
    ...audit.map((e) => ({ key: `a${e.eventId}`, when: e.occurredAt ?? '', title: AUDIT_KIND_LABEL[e.kind] ?? e.kind, role: roleName(e.actorRole), kind: 'audit' as const, txId: e.txId, block: e.blockNumber, status: e.status })),
  ].sort((a, b) => b.when.localeCompare(a.when));
  if (!items.length) return <EmptyState title="Belum ada aktivitas" icon={<ScrollText size={22} />}>Aktivitas pengajuan akan tampil berurutan di sini.</EmptyState>;
  return (
    <ol className="relative ml-3 border-l-2 border-line">
      {items.map((it) => (
        <li key={it.key} className="mb-5 ml-6">
          <span className={`absolute -left-[13px] grid h-6 w-6 place-items-center rounded-full ring-4 ring-white ${it.kind === 'chain' ? 'bg-chain text-white' : 'bg-slate-300 text-slate-700'}`}>{it.kind === 'chain' ? <Link2 size={13} aria-hidden /> : <ScrollText size={13} aria-hidden />}</span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-base font-medium text-ink">{it.title}</p>
            {it.kind === 'chain' ? <Badge tone="chain" icon={<Link2 size={13} aria-hidden />}>Tercatat permanen{it.block ? ` · blok ${it.block}` : ''}</Badge> : <ProofBadge status={it.status ?? 'saved'} />}
          </div>
          <p className="text-sm text-muted">{it.role} · {fmtDateTime(it.when)}</p>
          {it.txId && <div className="mt-2 max-w-xl"><TechnicalDetails items={[['Nomor transaksi', <CopyableMono key="t" value={it.txId} full />], ['Blok', it.block], ['Versi', it.version]]} /></div>}
        </li>
      ))}
    </ol>
  );
}


