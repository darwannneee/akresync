import { Download, FileText } from 'lucide-react';
import type { DocumentView } from '../../api/types';
import { Badge, Button, CopyableMono, DataTable, EmptyState, ProofBadge, TechnicalDetails } from '../../components/ui';
import { DOC_TYPE_LABEL, fmtBytes, fmtDateTime } from '../../lib/labels';
import { useDownload } from '../common/useAction';

export function DocumentsPanel({ docs, currentVersion }: { docs: DocumentView[]; currentVersion?: number }) {
  const download = useDownload();
  if (!docs.length) return <EmptyState title="Belum ada dokumen" icon={<FileText size={22} />}>Dokumen yang diunggah UPPS dan petugas akan tampil di sini beserta status pencatatannya.</EmptyState>;
  return (
    <DataTable rows={docs} rowKey={(d) => d.id} caption="Dokumen pengajuan"
      columns={[
        { key: 'j', header: 'Dokumen', primary: true, cell: (d) => <div className="min-w-0"><div className="font-medium text-ink">{DOC_TYPE_LABEL[d.docType] ?? d.docType}</div><div className="truncate text-sm text-muted" title={d.fileName}>{d.fileName} · {fmtBytes(d.sizeBytes)}</div><div className="text-sm text-muted">Diunggah {fmtDateTime(d.createdAt)}</div></div> },
        { key: 'v', header: 'Himpunan', cell: (d) => <Badge tone={d.setVersion === currentVersion ? 'info' : 'neutral'}>Versi {d.setVersion}{d.setVersion === currentVersion ? ' (berlaku)' : ''}</Badge> },
        { key: 'ai', header: 'Pemeriksaan AI', cell: (d) => (d.docType === 'LED' || d.docType === 'LKPS') ? <div className="space-y-1 text-sm"><Badge tone={d.docCheck?.status === 'verified' ? 'success' : d.docCheck?.status === 'mismatch' ? 'danger' : 'warn'}>{d.docCheck?.status === 'verified' ? 'Jenis sesuai' : d.docCheck?.status === 'mismatch' ? 'Jenis perlu diperiksa' : d.docCheck ? 'Verifikasi jenis tertunda' : 'Belum diperiksa'}</Badge><div className="text-muted">Indeks: {d.indexStatus === 'indexed' ? 'selesai' : d.indexStatus === 'failed' ? 'gagal' : d.indexStatus === 'indexing' ? 'berjalan' : d.indexStatus === 'skipped' ? 'tidak diindeks' : 'menunggu'}</div></div> : '—' },
        { key: 's', header: 'Bukti', cell: (d) => <ProofBadge status={d.auditStatus ?? 'saved'} /> },
        { key: 't', header: 'Rincian teknis', cell: (d) => <TechnicalDetails items={[['Sidik jari SHA-256', <CopyableMono key="s" value={d.sha256Plain} full />], ['CID penyimpanan', <CopyableMono key="c" value={d.cid} full />], ['Nomor transaksi audit', <CopyableMono key="t" value={d.auditTxId} full />]]} /> },
        { key: 'a', header: '', cell: (d) => <Button variant="secondary" size="sm" icon={<Download size={15} />} onClick={() => download(`/documents/${d.id}/download`, d.fileName)}>Unduh</Button> },
      ]} />
  );
}
