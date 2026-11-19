import { useState, type ReactNode } from 'react';
import { Download, ScrollText, Users } from 'lucide-react';
import type { AuditEventView, SubmissionDetail, User } from '../../api/types';
import { Button, Card, EmptyState, Notice, ScoreFigure, StatusDot, cx } from '../../components/ui';
import {
  ASSESS_STATUS_LABEL, AUDIT_KIND_LABEL, AUDIT_PHASE_LABEL, MODE_LABEL, OFFER_STATUS_LABEL, PAYMENT_STATUS_LABEL, PHASE_LABEL, RECORD_LABEL, RESPONSE_LABEL, SCHEDULE_STATUS_LABEL,
  auditPhase, fmtDateRange, fmtDateTime, fmtNumber, fmtRupiah, fmtScore, rankLabel, roleName, scoreFromTotal,
} from '../../lib/labels';
import { recordTime } from '../../lib/workflow';
import { useToast } from '../../components/Toast';
import { downloadFile, errorMessage } from '../../api/client';
import { AiProgressCard } from '../ai/ProgressCard';
import { TotalsView } from '../ai/parts';
import { AI_TAB_ROLES } from './types';

/** Ubah pesan galat chaincode menjadi kalimat untuk pengguna akademik (tanpa kode teknis). */
function plainChainError(raw: string): string {
  const msg = raw.replace(/^[A-Z_]+:\s*/, '').replace(/\s*\([^)]*\)/g, '').trim();
  const sentence = msg.charAt(0).toUpperCase() + msg.slice(1);
  return /^FORBIDDEN/.test(raw) ? `Ditolak karena kewenangan: ${msg}` : sentence;
}

const sameDecision = (a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined) =>
  !!a && !!b && ['rank', 'decreeNumber', 'totalScore', 'validFrom', 'validUntil'].every((k) => String(a[k] ?? '') === String(b[k] ?? ''));

type CertCheck = 'true' | 'false' | 'outdated' | 'unavailable';

/** Definisi "label : nilai" dua kolom ala v3. */
function Defs({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-x-4 gap-y-3 text-[14.5px]">
      {items.map(([k, v]) => <div key={k} className="contents"><dt className="text-faint">{k}</dt><dd className="min-w-0 break-words text-ink">{v ?? '—'}</dd></div>)}
    </dl>
  );
}
const Section = ({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) => (
  <section>
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[15px] font-semibold text-ink">{title}</h3>{aside && <span className="text-[13.5px] text-faint">{aside}</span>}</div>
    {children}
  </section>
);

export function DecisionSummary({ s }: { s: SubmissionDetail }) {
  const toast = useToast();
  const [check, setCheck] = useState<CertCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const decisions = (s.records ?? []).filter((r) => r.recordType === 'DECISION');
  const dec = decisions.slice(-1)[0];
  const p = dec?.payload as { rank?: string; decreeNumber?: string; validFrom?: string | null; validUntil?: string | null; totalScore?: number } | undefined;
  if (!p && !s.certificate) return null;
  // Sertifikat usang: keputusan dikoreksi setelah sertifikat terbit dan isinya berubah.
  const certDecision = decisions.find((r) => r.id === s.certificate?.decisionRecordId);
  const outdated = !!certDecision && !!dec && certDecision.id !== dec.id && !sameDecision(certDecision.payload, dec.payload);
  const download = async () => {
    setBusy(true);
    try {
      const h = await downloadFile(`/certificates/${s.certificate!.id}/download`, `sertifikat-${s.certificate!.certificateNo}.pdf`);
      setCheck((h.get('x-chain-verified') as CertCheck | null) ?? 'unavailable');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Card title="Keputusan akreditasi" actions={<StatusDot tone="ok">Tercatat permanen</StatusDot>}>
      {p && <Defs items={[['Peringkat', <b key="r" className="text-[17px] font-semibold text-navy-900">{rankLabel(p.rank)}</b>], ['Nomor Surat Keputusan', p.decreeNumber], ['Skor', `${fmtScore(scoreFromTotal(p.totalScore))} / 4,00 (total ${fmtNumber(p.totalScore)})`], ['Masa berlaku', p.validFrom ? fmtDateRange(p.validFrom, p.validUntil ?? undefined) : 'Tidak ada']]} />}
      <div className="mt-5 space-y-3">
        {outdated && <Notice tone="warn" title="Sertifikat perlu diterbitkan ulang">Keputusan akreditasi telah dikoreksi setelah sertifikat ini terbit, dan isinya berubah. Hubungi Sekretariat Administrasi untuk penerbitan ulang; sertifikat lama tidak lagi sesuai dengan keputusan terkini.</Notice>}
        {s.certificate
          ? <Button variant="secondary" className="no-print" icon={<Download size={16} />} loading={busy} onClick={() => void download()}>Unduh sertifikat ({s.certificate.certificateNo})</Button>
          : <p className="text-[14px] text-faint">Sertifikat belum diterbitkan oleh Sekretariat Administrasi.</p>}
        {check === 'true' && <Notice tone="success" title="Data keputusan pada sertifikat sesuai dengan catatan permanen">Peringkat, nomor Surat Keputusan, skor, dan masa berlaku yang tercantum pada sertifikat cocok dengan catatan penetapan yang tersimpan permanen. Pemeriksaan ini mencocokkan data keputusan, bukan isi berkas PDF.</Notice>}
        {check === 'outdated' && <Notice tone="warn" title="Sertifikat tidak lagi sesuai dengan keputusan terkini">Keputusan telah dikoreksi setelah sertifikat terbit. Sertifikat perlu diterbitkan ulang oleh Sekretariat Administrasi.</Notice>}
        {check === 'false' && <Notice tone="danger" title="Data keputusan pada sertifikat tidak sesuai dengan catatan permanen">Data keputusan yang dipakai untuk sertifikat ini berbeda dari catatan penetapan yang tersimpan permanen. Jangan gunakan sertifikat ini dan hubungi administrator.</Notice>}
        {check === 'unavailable' && <Notice tone="info" title="Pencocokan dengan catatan permanen belum dapat dilakukan">Berkas berhasil diunduh, tetapi layanan pencatatan permanen tidak dapat dihubungi untuk mencocokkan data keputusan. Coba unduh lagi nanti.</Notice>}
      </div>
    </Card>
  );
}

/* ---------------- Aktivitas (catatan resmi + peristiwa audit) ---------------- */
export interface ActivityItem { key: string; when: string; title: string; role: string; kind: 'chain' | 'audit'; status: string }
export function activityItems(s: SubmissionDetail, audit: AuditEventView[]): ActivityItem[] {
  return [
    ...(s.records ?? []).map((r) => ({ key: `r${r.id}`, when: recordTime(r) ?? '', title: `${RECORD_LABEL[r.recordType] ?? r.recordType}${r.version > 1 ? ' (koreksi)' : ''}`, role: roleName(r.actorRole as string), kind: 'chain' as const, status: r.status === 'pending_chain' ? 'sedang dicatat' : r.status === 'failed' ? 'pencatatan gagal' : 'tercatat permanen' })),
    ...audit.map((e) => ({ key: `a${e.eventId}`, when: e.occurredAt ?? '', title: AUDIT_KIND_LABEL[e.kind] ?? e.kind, role: roleName(e.actorRole), kind: 'audit' as const, status: AUDIT_PHASE_LABEL[auditPhase(e)].toLowerCase() })),
  ].sort((a, b) => b.when.localeCompare(a.when));
}

function Timeline({ items, compact }: { items: ActivityItem[]; compact?: boolean }) {
  return (
    <ol className={cx('relative ml-1 border-l border-line pl-5 text-[14.5px]', compact ? 'space-y-5' : 'space-y-6')}>
      {items.map((it, i) => (
        <li key={it.key} className="relative">
          <span aria-hidden className={cx('absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white', i === 0 ? 'bg-navy-700' : it.kind === 'chain' ? 'bg-navy-200' : 'bg-slate-300')} />
          <div className="text-ink">{it.title}</div>
          <div className="text-[13px] text-faint">{it.role} · {fmtDateTime(it.when)} · {it.status}</div>
        </li>
      ))}
    </ol>
  );
}

/** Linimasa gabungan catatan resmi dan peristiwa audit. */
export function ActivityTimeline({ s, audit }: { s: SubmissionDetail; audit: AuditEventView[] }) {
  const items = activityItems(s, audit);
  if (!items.length) return <EmptyState title="Belum ada aktivitas" icon={<ScrollText size={22} />}>Aktivitas pengajuan akan tampil berurutan di sini.</EmptyState>;
  return <Timeline items={items} />;
}

/* ---------------- Ringkasan ---------------- */
const Stat = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0 rounded-xl border border-line p-4"><div className="text-[13px] text-faint">{label}</div><div className="mt-1.5">{children}</div></div>
);
const Dash = () => <span className="text-[24px] font-semibold leading-none text-faint">—</span>;

export function SummaryTab({ s, audit, user, onHistory }: { s: SubmissionDetail; audit: AuditEventView[]; user: User; onHistory: () => void }) {
  const pay = s.payments?.[0];
  const adm = s.adminVerification;
  const ak = (s.assessments ?? []).filter((a) => a.phase === 'AK' && a.status === 'submitted' && a.totalScore != null);
  const akAvg = ak.length ? ak.reduce((n, a) => n + Number(a.totalScore), 0) / ak.length : null;
  const end = s.stage === 'released' || s.stage === 'admin_rejected' ? Date.parse(String(s.certificate?.issuedAt ?? s.updatedAt ?? '')) || Date.now() : Date.now();
  const start = Date.parse(String(s.createdAt ?? ''));
  const days = Number.isNaN(start) ? null : Math.max(0, Math.floor((end - start) / 86400000));
  const submittedRec = (s.records ?? []).filter((r) => r.recordType === 'SUBMISSION').sort((a, b) => String(recordTime(a)).localeCompare(String(recordTime(b))))[0];
  const docs = (s.documents ?? []).filter((d) => d.setVersion === s.documentSetVersion && (d.docType === 'LED' || d.docType === 'LKPS'));
  const recent = activityItems(s, audit).slice(0, 4);
  const aiRole = AI_TAB_ROLES.includes(user.role);
  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="min-w-0 space-y-7 lg:col-span-7">
        {adm && adm.result !== 'APPROVED' && (s.stage === 'admin_revision' || s.stage === 'admin_rejected') && (
          <Notice tone={adm.result === 'REJECTED' ? 'danger' : 'warn'} title={adm.result === 'REJECTED' ? 'Pengajuan ditolak pada verifikasi kelengkapan' : 'Sekretariat Administrasi meminta perbaikan dokumen'}>
            <span className="whitespace-pre-wrap">{adm.notes ?? 'Tidak ada catatan yang dicantumkan.'}</span>
          </Notice>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Skor AI dokumen">{s.aiScore?.totals.weighted != null ? <ScoreFigure value={s.aiScore.totals.weighted} max={s.aiScore.totals.scaleMax} className="flex-wrap" /> : <Dash />}</Stat>
          <Stat label="Skor AK asesor">{akAvg !== null ? <ScoreFigure value={scoreFromTotal(akAvg)} className="flex-wrap" /> : <Dash />}</Stat>
          <Stat label="Lama proses">{days !== null ? <span className="inline-flex items-baseline gap-1.5 tabular-nums"><span className="text-[24px] font-semibold leading-none text-ink">{days}</span><span className="text-sm text-faint">hari</span></span> : <Dash />}</Stat>
        </div>
        <Defs items={[
          ['Program studi', <span key="p" className="font-medium">{s.programName ? `${s.programName}${s.programLevel ? ` (${s.programLevel})` : ''}` : '—'}</span>],
          ['Institusi', s.institutionName],
          ['Diajukan', submittedRec ? fmtDateTime(recordTime(submittedRec)) : <span key="d" className="text-faint">Belum diajukan</span>],
          ['Dokumen', docs.length ? <>{docs.map((d) => d.fileName).join(', ')} <span className="text-faint">(versi {s.documentSetVersion})</span></> : <span key="x" className="text-faint">Belum ada dokumen utama</span>],
          ...(pay ? [['Tagihan', <>{pay.invoiceNo} · {fmtRupiah(pay.amount)} <span className="text-faint">· {PAYMENT_STATUS_LABEL[pay.status] ?? pay.status}</span></>] as [string, ReactNode]] : []),
          ...(pay?.notes ? [['Catatan tagihan', pay.notes] as [string, ReactNode]] : []),
        ]} />
        <DecisionSummary s={s} />
        {s.aiScore && !aiRole && (
          <Section title="Skor AI per kriteria" aside="Pendukung, bukan nilai resmi">
            <TotalsView totals={s.aiScore.totals} compact />
          </Section>
        )}
        {s.aiProgress && s.aiProgress.phase !== 'done' && <AiProgressCard p={s.aiProgress} />}
        {!!s.rejectedAttempts?.length && (
          <Notice tone="warn" title="Percobaan pencatatan yang tidak diterima">
            <ul className="mt-1 list-disc pl-5">{s.rejectedAttempts.map((a) => <li key={a.id}>{RECORD_LABEL[a.recordType] ?? a.recordType}{a.createdAt ? `, ${fmtDateTime(a.createdAt)}` : ''}{a.error ? `. ${plainChainError(a.error)}` : ''}</li>)}</ul>
            <p className="mt-1">Percobaan ini tidak tercatat dan tidak mengubah status pengajuan.</p>
          </Notice>
        )}
      </div>
      <div className="min-w-0 lg:col-span-5">
        <div className="mb-3 text-[14.5px] font-semibold">Aktivitas terbaru</div>
        {recent.length ? <Timeline items={recent} compact /> : <p className="text-[14px] text-faint">Belum ada aktivitas.</p>}
        <Button variant="ghost" size="sm" className="no-print -ml-3 mt-3" onClick={onHistory}>Lihat semua riwayat</Button>
      </div>
    </div>
  );
}

/* ---------------- Asesmen: penugasan, hasil, jadwal, tanggapan ---------------- */
const OFFER_TONE: Record<string, 'ok' | 'bad' | 'navy' | 'gray'> = { effective: 'ok', rejected: 'bad', offered: 'navy', replaced: 'gray' };
const SCHED_TONE: Record<string, 'ok' | 'bad' | 'warn'> = { approved: 'ok', rejected: 'bad', proposed: 'warn' };
const resp = (r?: string | null) => (r ? (RESPONSE_LABEL[r] ?? r).toLowerCase() : 'belum menanggapi');
const Rows = ({ children }: { children: ReactNode }) => <ul className="divide-y divide-line rounded-xl border border-line">{children}</ul>;
const Empty = ({ children }: { children: ReactNode }) => <p className="text-[14px] text-faint">{children}</p>;

export function AssessmentTab({ s }: { s: SubmissionDetail }) {
  const offers = s.offers ?? [];
  const assessments = s.assessments ?? [];
  const schedules = s.alSchedules ?? [];
  const responses = s.responses ?? [];
  if (!offers.length && !assessments.length && !schedules.length && !responses.length) return <EmptyState title="Asesmen belum dimulai" icon={<Users size={22} />}>Penawaran asesor, hasil penilaian, dan jadwal Asesmen Lapangan akan tampil di sini setelah pembayaran terverifikasi.</EmptyState>;
  return (
    <div className="space-y-9">
      <Section title="Penugasan asesor" aside={offers.length ? `${offers.length} penawaran` : undefined}>
        {offers.length ? (
          <Rows>
            {[...offers].reverse().map((o) => (
              <li key={o.id} className="px-[18px] py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">Penawaran ke-{o.offerNo}</span>
                  <StatusDot tone={OFFER_TONE[o.status] ?? 'gray'}>{OFFER_STATUS_LABEL[o.status] ?? o.status}</StatusDot>
                </div>
                <p className="mt-0.5 text-[14px] text-muted">{o.assessor1Name ?? o.assessor1Id} dan {o.assessor2Name ?? o.assessor2Id} · ketua {o.leadAssessorName ?? o.leadAssessorId}</p>
                <p className="mt-0.5 text-[13px] text-faint">Asesor pertama {resp(o.assessor1Response)}; asesor kedua {resp(o.assessor2Response)}; UPPS {resp(o.uppsResponse)}</p>
                {o.status === 'rejected' && o.rejectionReason && <p className="mt-1 text-[14px] text-ink">Alasan penolakan{o.rejectionBy ? ` (${o.rejectionBy === 'upps' ? 'UPPS' : 'asesor'})` : ''}: {o.rejectionReason}</p>}
              </li>
            ))}
          </Rows>
        ) : <Empty>Belum ada penawaran pasangan asesor.</Empty>}
      </Section>

      <Section title="Hasil penilaian" aside="Rata-rata berbobot, skala 0 sampai 4">
        {assessments.length ? (
          <Rows>
            {assessments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-[18px] py-3.5">
                <div className="min-w-0">
                  <div className="font-medium text-ink">{a.assessorName ?? a.assessorId}</div>
                  <div className="flex flex-wrap items-center gap-x-3 text-[13px] text-faint"><span>{PHASE_LABEL[a.phase]}</span><StatusDot tone={a.status === 'submitted' ? 'ok' : 'warn'} className="!text-[13px]">{ASSESS_STATUS_LABEL[a.status]}</StatusDot>{a.submittedAt && <span>{fmtDateTime(a.submittedAt)}</span>}</div>
                </div>
                {a.totalScore != null ? <span className="text-right"><ScoreFigure value={scoreFromTotal(a.totalScore)} size="sm" /><span className="block text-[12.5px] text-faint">total {fmtNumber(a.totalScore)}</span></span> : <span className="text-faint">—</span>}
              </li>
            ))}
          </Rows>
        ) : <Empty>Belum ada hasil penilaian.</Empty>}
      </Section>

      <Section title="Jadwal Asesmen Lapangan">
        {schedules.length ? (
          <Rows>
            {[...schedules].reverse().map((x) => (
              <li key={x.id} className="px-[18px] py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">{fmtDateRange(x.startDate, x.endDate)}</span>
                  <StatusDot tone={SCHED_TONE[x.status] ?? 'gray'}>{SCHEDULE_STATUS_LABEL[x.status] ?? x.status}</StatusDot>
                </div>
                <p className="mt-0.5 text-[14px] text-muted">{x.location} · {MODE_LABEL[x.mode] ?? x.mode} · usulan ke-{x.version}</p>
                {x.notes && <p className="mt-1 text-[14px] text-ink">Catatan: {x.notes}</p>}
              </li>
            ))}
          </Rows>
        ) : <Empty>Jadwal belum diusulkan. KEA mengusulkan jadwal Asesmen Lapangan, lalu Sekretariat Administrasi memutuskannya.</Empty>}
      </Section>

      {responses.length > 0 && (
        <Section title="Tanggapan atas hasil asesmen">
          <Rows>
            {responses.map((r) => (
              <li key={r.id} className="px-[18px] py-4">
                <p className="text-[13px] text-faint">{r.responderRole === 'upps' ? 'UPPS' : 'Ketua asesor'} · {RESPONSE_LABEL[r.responseType]} · {fmtDateTime(r.createdAt)}</p>
                <p className="mt-1 whitespace-pre-wrap text-[15px] text-ink">{r.body}</p>
              </li>
            ))}
          </Rows>
        </Section>
      )}
    </div>
  );
}
