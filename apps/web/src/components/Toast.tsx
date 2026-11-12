import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import type { ApiEnvelope, ChainReceipt } from '@akreditasi/shared';
import { AlertDialog, Button, CopyableMono, InfoTable, TechnicalDetails, cx } from './ui';
import { fmtDateTime } from '../lib/labels';

type Kind = 'success' | 'info' | 'warn' | 'error';
interface ToastItem { id: number; kind: Kind; title: string; lines?: string[] }
interface Receipt { title: string; chain: ChainReceipt; at: string }
interface ToastApi {
  push: (t: Omit<ToastItem, 'id'>) => void;
  /** Tindakan kelas A: "Tersimpan · jejak audit sedang dicatat". Kelas C: toast + tanda terima. */
  receipt: (env: ApiEnvelope<unknown>, title: string) => void;
  error: (message: string) => void;
}
const Ctx = createContext<ToastApi | null>(null);
let seq = 0;

const ICON = { success: CheckCircle2, info: Info, warn: AlertTriangle, error: XCircle } as const;
const COLOR = { success: 'text-ok', info: 'text-info', warn: 'text-wait', error: 'text-bad' } as const;
const BORDER = { success: 'border-l-ok', info: 'border-l-info', warn: 'border-l-wait', error: 'border-l-bad' } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = ++seq;
    setItems((x) => [...x, { ...t, id }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.kind === 'error' ? 10000 : 7000);
  }, []);
  const api = useMemo<ToastApi>(() => ({
    push,
    error: (message) => push({ kind: 'error', title: 'Tindakan belum berhasil', lines: [message] }),
    receipt: (env, title) => {
      if (env.chain) {
        push({ kind: 'success', title, lines: ['Tercatat permanen dan tidak dapat diubah.'] });
        setReceipt({ title, chain: env.chain, at: new Date().toISOString() });
        return;
      }
      const st = env.audit?.status;
      if (st === 'failed') push({ kind: 'warn', title, lines: ['Tersimpan. Pencatatan jejak audit belum berhasil dan akan dicoba ulang oleh sistem.'] });
      else if (st === 'committed') push({ kind: 'success', title, lines: ['Tersimpan · jejak audit tercatat permanen.'] });
      else if (st === 'pending') push({ kind: 'info', title, lines: ['Tersimpan · jejak audit sedang dicatat. Status akan diperbarui otomatis.'] });
      else push({ kind: 'success', title, lines: ['Tersimpan.'] });
    },
  }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="toast-region pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 p-3 sm:items-end sm:p-4">
        {items.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={cx('pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded border border-l-4 border-line bg-white px-3 py-2.5 shadow-lg', BORDER[t.kind])}>
              <Icon size={18} className={cx('mt-0.5 shrink-0', COLOR[t.kind])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t.title}</p>
                {t.lines?.map((l, i) => <p key={i} className="text-sm text-muted">{l}</p>)}
              </div>
              <button type="button" aria-label="Tutup pemberitahuan" className="grid h-7 w-7 place-items-center rounded text-faint hover:bg-slate-100" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}><X size={16} /></button>
            </div>
          );
        })}
      </div>
      <AlertDialog open={!!receipt} onClose={() => setReceipt(null)} kind="success" title={receipt?.title ?? ''} text="Tercatat permanen dan tidak dapat diubah." actions={<Button onClick={() => setReceipt(null)}>Selesai</Button>}>
        {receipt && (
          <div className="space-y-3">
            <InfoTable items={[['Waktu pencatatan', fmtDateTime(receipt.at)], ['Versi catatan', receipt.chain.version]]} />
            <TechnicalDetails items={[
              ['Nomor transaksi (txId)', <CopyableMono key="t" value={receipt.chain.txId} full />],
              ['Nomor blok', receipt.chain.blockNumber],
              ['Kunci catatan', <CopyableMono key="k" value={receipt.chain.recordKey} full />],
              ['Status', receipt.chain.status],
            ]} />
          </div>
        )}
      </AlertDialog>
    </Ctx.Provider>
  );
}
export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast di luar ToastProvider');
  return c;
}
