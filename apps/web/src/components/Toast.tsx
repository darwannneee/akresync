import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ApiEnvelope } from '@akreditasi/shared';
import { cx } from './ui';

type Kind = 'success' | 'info' | 'warn' | 'error';
interface ToastItem { id: number; kind: Kind; title: string; lines?: string[] }
interface ToastApi {
  push: (t: Omit<ToastItem, 'id'>) => void;
  /** Tampilkan tiga status berbeda: tersimpan di DB, audit tertunda, tercatat on-chain. */
  receipt: (env: ApiEnvelope<unknown>, title: string) => void;
  error: (message: string) => void;
}
const Ctx = createContext<ToastApi | null>(null);
let seq = 0;

const short = (s: string) => (s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = ++seq;
    setItems((x) => [...x, { ...t, id }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.kind === 'error' ? 9000 : 7000);
  }, []);
  const api = useMemo<ToastApi>(() => ({
    push,
    error: (message) => push({ kind: 'error', title: 'Gagal', lines: [message] }),
    receipt: (env, title) => {
      const lines: string[] = [];
      let kind: Kind = 'success';
      if (env.chain) lines.push(`Tercatat on-chain (VALID) — txId ${short(env.chain.txId)}, blok ${env.chain.blockNumber}`);
      else lines.push('Tersimpan di basis data.');
      if (env.audit) {
        if (env.audit.status === 'committed') lines.push('Audit tercatat on-chain.');
        else if (env.audit.status === 'failed') { lines.push('Audit gagal dicatat; akan dicoba ulang oleh layanan.'); kind = 'warn'; }
        else { lines.push('Audit tertunda — menunggu pencatatan ke ledger.'); kind = 'info'; }
      }
      push({ kind, title, lines });
    },
  }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-3 sm:items-end">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className={cx('pointer-events-auto w-full max-w-sm rounded-lg border-l-4 bg-white p-3 shadow-lg ring-1 ring-slate-200',
              t.kind === 'success' && 'border-emerald-600', t.kind === 'info' && 'border-navy-700', t.kind === 'warn' && 'border-amber-500', t.kind === 'error' && 'border-red-600')}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-navy-900">{t.title}</p>
              <button aria-label="Tutup" className="text-slate-400 hover:text-slate-700" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}>✕</button>
            </div>
            {t.lines?.map((l, i) => <p key={i} className="text-xs text-slate-700">{l}</p>)}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast di luar ToastProvider');
  return c;
}
