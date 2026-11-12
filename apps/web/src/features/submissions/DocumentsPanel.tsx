import type { DocumentView } from '../../api/types';
import { Button, EmptyState, Table, Td } from '../../components/ui';
import { AuditBadge, fmtBytes, fmtDate, short } from '../common/labels';
import { useDownload } from '../common/useAction';

const TYPE: Record<string, string> = { LED: 'LED', LKPS: 'LKPS', SUPPORT: 'Pendukung', PAYMENT_PROOF: 'Bukti bayar', AL_MINUTES: 'Berita acara AL', CERTIFICATE: 'Sertifikat' };

export function DocumentsPanel({ docs }: { docs: DocumentView[] }) {
  const download = useDownload();
  if (!docs.length) return <EmptyState title="Belum ada dokumen" />;
  return (
    <Table caption="Dokumen pengajuan" head={['Jenis', 'Berkas', 'Set', 'SHA-256', 'CID', 'Audit', 'Diunggah', '']}>
      {docs.map((d) => (
        <tr key={d.id}>
          <Td>{TYPE[d.docType] ?? d.docType}</Td>
          <Td><div className="max-w-[14rem] truncate" title={d.fileName}>{d.fileName}</div><div className="text-xs text-slate-500">{fmtBytes(d.sizeBytes)}</div></Td>
          <Td>v{d.setVersion}</Td>
          <Td><code className="text-xs" title={d.sha256Plain}>{short(d.sha256Plain, 10, 0)}</code></Td>
          <Td><code className="text-xs" title={d.cid}>{short(d.cid, 8, 4)}</code></Td>
          <Td><AuditBadge status={d.auditStatus ?? 'saved'} /></Td>
          <Td>{fmtDate(d.createdAt)}</Td>
          <Td><Button variant="ghost" className="!min-h-[32px] !px-2" onClick={() => download(`/documents/${d.id}/download`, d.fileName)}>Unduh</Button></Td>
        </tr>
      ))}
    </Table>
  );
}
