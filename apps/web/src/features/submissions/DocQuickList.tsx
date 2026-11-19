import { FileText } from 'lucide-react';
import type { DocumentView } from '../../api/types';
import { DOC_TYPE_LABEL, fmtBytes } from '../../lib/labels';
import { useDownload } from '../common/useAction';
import { VersionHistory, type DocSplit } from './DocumentsPanel';

/** Daftar ringkas berkas dengan tautan unduh, dipakai pemeriksa saat memverifikasi. `history` menampilkan versi lama terlipat per versi. */
export function DocQuickList({ docs, history, empty = 'Belum ada berkas.' }: { docs: DocumentView[]; history?: DocSplit; empty?: string }) {
  const download = useDownload();
  const list = (items: DocumentView[], bordered: boolean) => (
    <ul className={bordered ? 'divide-y divide-line rounded-xl border border-line bg-white' : 'divide-y divide-line'}>
      {items.map((d) => (
        <li key={d.id}>
          <button type="button" onClick={() => download(`/documents/${d.id}/download`, d.fileName)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
            <FileText size={18} className="shrink-0 text-faint" aria-hidden />
            <span className="min-w-0 flex-1 text-[14.5px]"><span className="block truncate text-ink" title={d.fileName}>{d.fileName}</span><span className="block text-[13px] text-faint">{[DOC_TYPE_LABEL[d.docType] ?? d.docType, fmtBytes(d.sizeBytes), history?.notes.get(d.id)].filter(Boolean).join(' · ')}</span></span>
            <span className="text-[14px] font-semibold text-navy-700">Unduh</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="space-y-3">
      {docs.length ? list(docs, true) : <p className="text-[14px] text-faint">{empty}</p>}
      {history && <VersionHistory split={history} render={(items) => list(items, false)} />}
    </div>
  );
}
