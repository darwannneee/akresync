import { Download, FileText } from 'lucide-react';
import type { DocumentView } from '../../api/types';
import { Button } from '../../components/ui';
import { DOC_TYPE_LABEL, fmtBytes } from '../../lib/labels';
import { useDownload } from '../common/useAction';

/** Daftar ringkas berkas dengan tombol unduh, dipakai pemeriksa saat memverifikasi. */
export function DocQuickList({ docs, empty = 'Belum ada berkas.' }: { docs: DocumentView[]; empty?: string }) {
  const download = useDownload();
  if (!docs.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-white">
      {docs.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <FileText size={20} className="shrink-0 text-navy-700" aria-hidden />
          <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink" title={d.fileName}>{d.fileName}</div><div className="text-sm text-muted">{DOC_TYPE_LABEL[d.docType] ?? d.docType} · {fmtBytes(d.sizeBytes)}</div></div>
          <Button variant="secondary" size="sm" icon={<Download size={15} />} onClick={() => download(`/documents/${d.id}/download`, d.fileName)}>Unduh</Button>
        </li>
      ))}
    </ul>
  );
}
