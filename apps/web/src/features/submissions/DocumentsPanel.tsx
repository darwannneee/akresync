import type { ReactNode } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import type { DocumentView } from '../../api/types';
import { Button, CopyableMono, EmptyState, StatusDot, TechnicalDetails } from '../../components/ui';
import { DOC_TYPE_LABEL, fmtBytes, fmtDateTime } from '../../lib/labels';
import { useDownload } from '../common/useAction';
import { ProofStatus } from './AuditTable';

/** Peran yang berhak mengunduh bukti bayar (selaras dengan API). */
const PROOF_ROLES = ['upps', 'sek_keu', 'sek_adm'];
const INDEX_TEXT: Record<string, string> = { indexed: 'selesai', failed: 'gagal', indexing: 'berjalan', skipped: 'tidak diindeks' };

function AiCheck({ d }: { d: DocumentView }) {
  if (d.docType !== 'LED' && d.docType !== 'LKPS') return null;
  const st = d.docCheck?.status;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <StatusDot tone={st === 'verified' ? 'ok' : st === 'mismatch' ? 'bad' : 'warn'}>{st === 'verified' ? 'Jenis sesuai' : st === 'mismatch' ? 'Jenis perlu diperiksa' : d.docCheck ? 'Verifikasi jenis tertunda' : 'Belum diperiksa'}</StatusDot>
      <span className="text-[13px] text-faint">Indeks AI: {INDEX_TEXT[d.indexStatus ?? ''] ?? 'menunggu'}</span>
    </span>
  );
}

const SET_TYPES = ['LED', 'LKPS', 'SUPPORT'];
const ORDER = ['LED', 'LKPS', 'SUPPORT', 'PAYMENT_PROOF', 'AL_MINUTES', 'CERTIFICATE'];
const byType = (a: DocumentView, b: DocumentView) => (ORDER.indexOf(a.docType) - ORDER.indexOf(b.docType)) || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));

export interface VersionGroup {
  version: number;
  docs: DocumentView[];
  at: string | null;
  /** Jenis dokumen yang berkasnya berbeda dari versi sebelumnya (diunggah pada versi ini). */
  changed: string[];
}
export interface DocSplit {
  current: DocumentView[];
  /** Himpunan dokumen lama, terbaru lebih dahulu; isi lengkap tiap versi. */
  versions: VersionGroup[];
  /** Berkas lama jenis lain (bukti bayar, berita acara, sertifikat) yang sudah digantikan. */
  others: DocumentView[];
  /** Keterangan per dokumen: "diunggah pada versi ini" atau "sama dengan versi N". */
  notes: Map<string, string>;
}

/**
 * Dokumen berlaku: LED/LKPS/pendukung pada himpunan versi berjalan, serta berkas terbaru untuk jenis lain
 * (bukti bayar, berita acara, sertifikat). Versi lama dikelompokkan per nomor versi.
 */
export function splitDocuments(docs: DocumentView[], currentVersion?: number): DocSplit {
  const latestOther = new Map<string, DocumentView>();
  for (const d of docs) if (!SET_TYPES.includes(d.docType) && String(d.createdAt ?? '') >= String(latestOther.get(d.docType)?.createdAt ?? '')) latestOther.set(d.docType, d);
  const current = docs.filter((d) => (SET_TYPES.includes(d.docType) ? d.setVersion === currentVersion : latestOther.get(d.docType)?.id === d.id)).sort(byType);
  const sets = new Map<number, DocumentView[]>();
  for (const d of docs) if (SET_TYPES.includes(d.docType)) sets.set(d.setVersion, [...(sets.get(d.setVersion) ?? []), d]);
  const ordered = [...sets.keys()].sort((a, b) => a - b);
  const notes = new Map<string, string>();
  const changedOf = new Map<number, string[]>();
  ordered.forEach((v, i) => {
    const prev = i > 0 ? sets.get(ordered[i - 1]!)! : [];
    const changed = new Set<string>();
    for (const d of sets.get(v)!) {
      const same = prev.find((p) => p.docType === d.docType && p.sha256Plain === d.sha256Plain);
      if (same) notes.set(d.id, `sama dengan versi ${ordered[i - 1]}`);
      else { notes.set(d.id, i === 0 ? 'diunggah pertama kali' : 'diunggah pada versi ini'); changed.add(d.docType); }
    }
    changedOf.set(v, [...changed]);
  });
  const versions = ordered.filter((v) => v !== currentVersion).reverse().map((v) => {
    const list = sets.get(v)!.sort(byType);
    return { version: v, docs: list, at: list.reduce<string | null>((m, d) => (!m || String(d.createdAt ?? '') > m ? d.createdAt ?? m : m), null), changed: changedOf.get(v) ?? [] };
  });
  const others = docs.filter((d) => !SET_TYPES.includes(d.docType) && !current.includes(d)).sort(byType);
  return { current, versions, others, notes };
}

const changedText = (g: VersionGroup) => (g.changed.length ? `${g.changed.map((t) => (t === 'SUPPORT' ? 'pendukung' : t)).join(', ')} diganti` : 'tanpa perubahan berkas');

/** Riwayat versi terlipat: satu bagian per versi, isi ditampilkan oleh `render`. */
export function VersionHistory({ split, render }: { split: DocSplit; render: (docs: DocumentView[]) => ReactNode }) {
  const { versions, others } = split;
  if (!versions.length && !others.length) return null;
  const sum = 'flex min-h-[46px] cursor-pointer list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden';
  const chev = <ChevronDown size={16} className="shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden />;
  return (
    <details className="group rounded-xl border border-line bg-white print-block">
      <summary className={`${sum} text-[14.5px] font-medium text-muted hover:text-ink`}>
        <span>Versi sebelumnya <span className="font-normal text-faint">({[versions.length && `${versions.length} versi`, others.length && `${others.length} berkas lain`].filter(Boolean).join(', ')})</span></span>{chev}
      </summary>
      <div className="space-y-2 border-t border-line p-3">
        {versions.map((g) => (
          <details key={g.version} className="group rounded-lg border border-line">
            <summary className={`${sum} text-[14px] hover:bg-slate-50`}>
              <span className="min-w-0"><span className="font-semibold text-ink">Versi {g.version}</span><span className="text-faint"> · {[g.at ? fmtDateTime(g.at) : null, changedText(g), `${g.docs.length} berkas`].filter(Boolean).join(' · ')}</span></span>{chev}
            </summary>
            <div className="border-t border-line">{render(g.docs)}</div>
          </details>
        ))}
        {others.length > 0 && (
          <details className="group rounded-lg border border-line">
            <summary className={`${sum} text-[14px] hover:bg-slate-50`}><span><span className="font-semibold text-ink">Berkas lain yang telah diganti</span><span className="text-faint"> · {others.length} berkas</span></span>{chev}</summary>
            <div className="border-t border-line">{render(others)}</div>
          </details>
        )}
      </div>
    </details>
  );
}

export function DocumentsPanel({ docs, currentVersion, role }: { docs: DocumentView[]; currentVersion?: number; role?: string }) {
  if (!docs.length) return <EmptyState title="Belum ada dokumen" icon={<FileText size={22} />}>Dokumen yang diunggah UPPS dan petugas akan tampil di sini beserta status pencatatannya.</EmptyState>;
  const split = splitDocuments(docs, currentVersion);
  return (
    <div className="space-y-4">
      <DocList docs={split.current} currentVersion={currentVersion} role={role} notes={split.notes} />
      <VersionHistory split={split} render={(list) => <DocList docs={list} currentVersion={currentVersion} role={role} notes={split.notes} muted />} />
    </div>
  );
}

function DocList({ docs, currentVersion, role, muted, notes }: { docs: DocumentView[]; currentVersion?: number; role?: string; muted?: boolean; notes?: Map<string, string> }) {
  const download = useDownload();
  return (
    <ul className={muted ? 'divide-y divide-line' : 'divide-y divide-line rounded-xl border border-line'}>
      {docs.map((d) => {
        const Icon = /\.(xlsx?|csv)$/i.test(d.fileName) ? FileSpreadsheet : FileText;
        const locked = d.docType === 'PAYMENT_PROOF' && !PROOF_ROLES.includes(role ?? '');
        return (
          <li key={d.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-[18px] py-4">
            <Icon size={20} className="mt-0.5 shrink-0 text-faint" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div>
                <div className="font-medium text-ink">{DOC_TYPE_LABEL[d.docType] ?? d.docType}</div>
                <div className="truncate text-[13.5px] text-faint" title={d.fileName}>{[d.fileName, fmtBytes(d.sizeBytes), SET_TYPES.includes(d.docType) ? (d.setVersion === currentVersion ? `versi ${d.setVersion} (berlaku)` : `versi ${d.setVersion}`) : null, notes?.get(d.id) ?? (d.createdAt ? `diunggah ${fmtDateTime(d.createdAt)}` : null)].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1"><ProofStatus status={d.auditStatus ?? 'saved'} attempts={d.auditAttempts} /><AiCheck d={d} /></div>
              <div className="max-w-xl"><TechnicalDetails items={[['Sidik jari SHA-256', <CopyableMono key="s" value={d.sha256Plain} full />], ['CID penyimpanan', <CopyableMono key="c" value={d.cid} full />], ['Nomor transaksi audit', <CopyableMono key="t" value={d.auditTxId} full />]]} /></div>
            </div>
            {locked
              ? <span className="text-[13px] text-faint">Hanya untuk UPPS pemilik dan Sekretariat</span>
              : <Button variant="ghost" size="sm" className="no-print" icon={<Download size={15} />} onClick={() => download(`/documents/${d.id}/download`, d.fileName)}>Unduh</Button>}
          </li>
        );
      })}
    </ul>
  );
}
