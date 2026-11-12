import {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, Clock, Copy, HelpCircle, Home, Info, Link2, Loader2, Lock, X, XCircle } from 'lucide-react';
import { ROLE_HOME, type AuditStatus } from '@akreditasi/shared';
import { useAuth } from '../auth/AuthContext';
import { AUDIT_STATUS_LABEL } from '../lib/labels';
import type { StepStatus } from '../lib/workflow';
import { STATUS_LABEL } from '../lib/workflow';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'border border-navy-700 bg-navy-700 text-white hover:bg-navy-800 hover:border-navy-800 active:bg-navy-900',
  secondary: 'border border-slate-300 bg-white text-ink hover:bg-slate-50 hover:border-slate-400',
  danger: 'border border-bad bg-bad text-white hover:bg-red-800 hover:border-red-800',
  ghost: 'border border-transparent text-navy-700 hover:bg-navy-50',
};
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, icon, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" {...rest} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'min-h-[36px] px-3 py-1' : 'min-h-[38px] px-4 py-1.5', VARIANTS[variant], className)}>
      {loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
export function Spinner({ className }: { className?: string }) {
  return <Loader2 role="status" aria-label="Memuat" size={22} className={cx('animate-spin text-navy-700', className)} />;
}

/* ---------- Card ---------- */
export function Card({ title, description, actions, children, className, flush, id }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean; id?: string }) {
  return (
    <section id={id} className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-medium leading-snug text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? '' : 'p-4 sm:p-5'}>{children}</div>
    </section>
  );
}

/* ---------- Badge & pills (badge lembut ala Bootstrap) ---------- */
export type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger' | 'chain' | 'gold';
const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  info: 'bg-info-bg text-info border-info-line',
  success: 'bg-ok-bg text-ok border-ok-line',
  warn: 'bg-wait-bg text-wait border-wait-line',
  danger: 'bg-bad-bg text-bad border-bad-line',
  chain: 'bg-chain-bg text-chain border-chain-line',
  gold: 'bg-[#FBF5DC] text-[#7A5F00] border-[#E8D58A]',
};
export function Badge({ tone = 'neutral', children, title, icon, className }: { tone?: Tone; children: ReactNode; title?: string; icon?: ReactNode; className?: string }) {
  return <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>{icon}{children}</span>;
}
const STEP_TONE: Record<StepStatus, Tone> = { selesai: 'success', aktif: 'info', menunggu: 'warn', terkunci: 'neutral', ditolak: 'danger' };
export function StatusPill({ status, label }: { status: StepStatus; label?: string }) {
  const Icon = status === 'selesai' ? CheckCircle2 : status === 'ditolak' ? XCircle : status === 'menunggu' ? Clock : status === 'terkunci' ? Lock : Circle;
  return <Badge tone={STEP_TONE[status]} icon={<Icon size={12} aria-hidden />}>{label ?? STATUS_LABEL[status]}</Badge>;
}
/** Bukti pencatatan: Tersimpan (abu), Tertunda (amber), Tercatat permanen (indigo), Gagal (merah). */
export function ProofBadge({ status }: { status?: AuditStatus | 'saved' | null }) {
  const s = status ?? 'saved';
  const label = AUDIT_STATUS_LABEL[s] ?? AUDIT_STATUS_LABEL.saved;
  if (s === 'committed') return <Badge tone="chain" icon={<Link2 size={12} aria-hidden />}>{label}</Badge>;
  if (s === 'pending') return <Badge tone="warn" icon={<span className="dot-pulse inline-block h-1.5 w-1.5 rounded-full bg-wait" aria-hidden />}>{label}</Badge>;
  if (s === 'failed') return <Badge tone="danger" icon={<XCircle size={12} aria-hidden />}>{label}</Badge>;
  return <Badge tone="neutral">{label}</Badge>;
}

/* ---------- Notice / alert ---------- */
const NOTICE: Record<'info' | 'warn' | 'danger' | 'success' | 'chain', { cls: string; Icon: typeof Info; color: string }> = {
  info: { cls: 'border-info-line bg-info-bg', Icon: Info, color: 'text-info' },
  warn: { cls: 'border-wait-line bg-wait-bg', Icon: AlertTriangle, color: 'text-wait' },
  danger: { cls: 'border-bad-line bg-bad-bg', Icon: XCircle, color: 'text-bad' },
  success: { cls: 'border-ok-line bg-ok-bg', Icon: CheckCircle2, color: 'text-ok' },
  chain: { cls: 'border-chain-line bg-chain-bg', Icon: Link2, color: 'text-chain' },
};
export function Notice({ tone = 'info', title, children, className }: { tone?: keyof typeof NOTICE; title?: string; children?: ReactNode; className?: string }) {
  const { cls, Icon, color } = NOTICE[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={cx('flex gap-2.5 rounded border px-3 py-2.5 text-sm text-slate-800', cls, className)}>
      <Icon size={17} className={cx('mt-0.5 shrink-0', color)} aria-hidden />
      <div className="min-w-0">{title && <p className="font-medium text-ink">{title}</p>}{children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}</div>
    </div>
  );
}
export const FormError = ({ message }: { message?: string | null }) => (message ? <Notice tone="danger">{message}</Notice> : null);

/* ---------- Tabel data ala DataTables: tampilkan N entri, cari, paginasi (semua di sisi klien) ---------- */
export interface Column<T> { key: string; header: string; cell: (row: T) => ReactNode; align?: 'left' | 'right'; primary?: boolean; className?: string }
const PAGE_SIZES = [10, 25, 50, 100];
function pageList(page: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const from = Math.max(2, page - 1); const to = Math.min(total - 1, page + 1);
  if (from > 2) out.push('…');
  for (let p = from; p <= to; p++) out.push(p);
  if (to < total - 1) out.push('…');
  out.push(total);
  return out;
}
export function DataTable<T>({ columns, rows, rowKey, caption, onRowClick, toolbar, search, searchValue, onSearchChange, toolbarExtra, pageSize: initialSize = 10, emptyText = 'Tidak ada data yang sesuai.' }: {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; caption?: string; onRowClick?: (r: T) => void;
  /** Tampilkan baris "Tampilkan N entri / Cari" dan paginasi. Tanpa ini tabel ditampilkan utuh. */
  toolbar?: boolean;
  /** Teks yang dicari untuk satu baris. Tanpa fungsi ini kotak cari tidak ditampilkan. */
  search?: (r: T) => string;
  searchValue?: string; onSearchChange?: (v: string) => void; toolbarExtra?: ReactNode;
  pageSize?: number; emptyText?: string;
}) {
  const id = useId();
  const [own, setOwn] = useState('');
  const q = searchValue ?? own;
  const setQ = (v: string) => { setOwn(v); onSearchChange?.(v); setPage(1); };
  const [size, setSize] = useState(initialSize);
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return toolbar && search && t ? rows.filter((r) => search(r).toLowerCase().includes(t)) : rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, toolbar]);
  const pages = toolbar ? Math.max(1, Math.ceil(filtered.length / size)) : 1;
  const cur = Math.min(page, pages);
  const visible = toolbar ? filtered.slice((cur - 1) * size, cur * size) : filtered;
  const from = filtered.length ? (cur - 1) * size + 1 : 0;
  const to = toolbar ? Math.min(cur * size, filtered.length) : filtered.length;
  return (
    <div>
      {toolbar && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2" htmlFor={`${id}-size`}>Tampilkan
              <select id={`${id}-size`} value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }} className="input !w-auto !py-1">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>entri
            </label>
            {toolbarExtra}
          </div>
          {search && (
            <label className="flex items-center gap-2" htmlFor={`${id}-q`}>Cari:
              <input id={`${id}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} className="input !w-56" />
            </label>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded border border-line">
        <table className="min-w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-slate-100 text-left text-slate-800">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className={cx('whitespace-nowrap border-b border-line px-3 py-2.5 font-medium', c.align === 'right' && 'text-right')}>{c.header}</th>)}</tr>
          </thead>
          <tbody className="bg-white">
            {visible.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-muted">{emptyText}</td></tr>}
            {visible.map((r) => (
              <tr key={rowKey(r)} className={cx('border-b border-line last:border-b-0 hover:bg-slate-50', onRowClick && 'cursor-pointer')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => <td key={c.key} className={cx('px-3 py-2.5 align-top', c.align === 'right' && 'text-right tabular-nums', c.className)}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toolbar && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <p aria-live="polite">Menampilkan {from}–{to} dari {filtered.length} entri{filtered.length !== rows.length ? ` (disaring dari ${rows.length} entri)` : ''}</p>
          {pages > 1 && (
            <nav aria-label="Halaman tabel">
              <ul className="flex flex-wrap items-center gap-1">
                <li><button type="button" disabled={cur === 1} onClick={() => setPage(cur - 1)} className="inline-flex min-h-[36px] items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-ink hover:bg-slate-50 disabled:opacity-50"><ChevronLeft size={14} aria-hidden />Sebelumnya</button></li>
                {pageList(cur, pages).map((p, i) => p === '…'
                  ? <li key={`e${i}`} className="px-1" aria-hidden>…</li>
                  : <li key={p}><button type="button" aria-current={p === cur ? 'page' : undefined} onClick={() => setPage(p)} className={cx('min-h-[36px] min-w-[36px] rounded border px-2', p === cur ? 'border-navy-700 bg-navy-700 text-white' : 'border-slate-300 bg-white text-ink hover:bg-slate-50')}>{p}</button></li>)}
                <li><button type="button" disabled={cur === pages} onClick={() => setPage(cur + 1)} className="inline-flex min-h-[36px] items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-ink hover:bg-slate-50 disabled:opacity-50">Berikutnya<ChevronRight size={14} aria-hidden /></button></li>
              </ul>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Tabs (nav-tabs) ---------- */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
    onChange(n.id);
    document.getElementById(`tab-${n.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="no-print flex gap-0.5 overflow-x-auto border-b border-line">
      {tabs.map((t, i) => (
        <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={t.id === value} aria-controls={`panel-${t.id}`} tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}
          className={cx('-mb-px min-h-[40px] whitespace-nowrap rounded-t border px-4 py-2 text-sm transition-colors',
            t.id === value ? 'border-line border-b-white bg-white font-medium text-navy-700' : 'border-transparent text-muted hover:border-slate-200 hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className={cx('ml-1.5 rounded px-1.5 py-0.5 text-xs', t.id === value ? 'bg-navy-50 text-navy-700' : 'bg-slate-100 text-muted')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Dialog dasar (modal, konfirmasi): tumpukan, jebakan fokus, Escape menutup yang teratas ---------- */
const dialogStack: symbol[] = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const token = Symbol('dialog');
    dialogStack.push(token);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== token) return;
      if (e.key === 'Escape') { closeRef.current(); return; }
      if (e.key === 'Tab' && ref.current) {
        const els = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
        if (!els.length) return;
        const first = els[0]!; const last = els[els.length - 1]!;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      dialogStack.splice(dialogStack.indexOf(token), 1);
      if (!dialogStack.length) document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open]);
  return ref;
}

/** Tata letak formulir: 'horizontal' (label di kiri) dipakai di dalam modal dan halaman pendaftaran. */
const FormLayoutCtx = createContext<'stack' | 'horizontal'>('stack');
export const useFormLayout = () => useContext(FormLayoutCtx);
export const HorizontalForm = ({ children }: { children: ReactNode }) => <FormLayoutCtx.Provider value="horizontal">{children}</FormLayoutCtx.Provider>;

interface ModalCtxValue { footer: HTMLElement | null; close: () => void }
const ModalCtx = createContext<ModalCtxValue | null>(null);

/** Tombol aksi formulir. Di dalam modal dipindahkan ke footer (Batal + tombol utama); di luar modal tampil sebaris. */
export function ModalActions({ children, cancel = true }: { children: ReactNode; cancel?: boolean }) {
  const m = useContext(ModalCtx);
  if (m?.footer) {
    return createPortal(<>{cancel && <Button variant="secondary" onClick={m.close}>Batal</Button>}{children}</>, m.footer);
  }
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useDialog(open, onClose);
  const id = useId();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const ctx = useMemo(() => ({ footer: slot, close: onClose }), [slot, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="no-print fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id}
        className={cx('my-0 flex max-h-[calc(100vh-1.5rem)] w-full flex-col rounded-md border border-line bg-white shadow-xl outline-none sm:my-6 sm:max-h-[calc(100vh-3rem)]', wide ? 'max-w-3xl' : 'max-w-xl')}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={id} className="text-base font-medium">{title}</h2>
          <button type="button" aria-label="Tutup" onClick={onClose} className="grid h-9 w-9 place-items-center rounded text-faint hover:bg-slate-100 hover:text-ink"><X size={18} /></button>
        </header>
        <ModalCtx.Provider value={ctx}>
          <FormLayoutCtx.Provider value="horizontal"><div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div></FormLayoutCtx.Provider>
          <footer className="flex flex-wrap items-center justify-end gap-2 rounded-b-md border-t border-line bg-slate-50 px-4 py-3 [&:not(:has(button))]:hidden">
            {footer}
            <div ref={setSlot} className="contents" />
          </footer>
        </ModalCtx.Provider>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Dialog gaya SweetAlert: ikon besar, judul, teks, tombol di tengah ---------- */
type AlertKind = 'question' | 'warning' | 'success' | 'error';
const ALERT_ICON: Record<AlertKind, { Icon: typeof Info; cls: string }> = {
  question: { Icon: HelpCircle, cls: 'border-navy-200 text-navy-700' },
  warning: { Icon: AlertTriangle, cls: 'border-wait-line text-wait' },
  success: { Icon: CheckCircle2, cls: 'border-ok-line text-ok' },
  error: { Icon: XCircle, cls: 'border-bad-line text-bad' },
};
export function AlertDialog({ open, onClose, kind, title, text, children, actions }: { open: boolean; onClose: () => void; kind: AlertKind; title: string; text?: ReactNode; children?: ReactNode; actions: ReactNode }) {
  const ref = useDialog(open, onClose);
  const id = useId();
  if (!open) return null;
  const { Icon, cls } = ALERT_ICON[kind];
  return createPortal(
    <div className="no-print fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby={id} className="my-4 w-full max-w-md rounded-md border border-line bg-white px-5 pb-5 pt-7 text-center shadow-xl outline-none">
        <span className={cx('mx-auto grid h-16 w-16 place-items-center rounded-full border-4', cls)}><Icon size={32} aria-hidden /></span>
        <h2 id={id} className="mt-4 text-xl font-medium text-ink">{title}</h2>
        {text && <p className="mt-1.5 text-sm text-muted">{text}</p>}
        {children && <div className="mt-4 text-left">{children}</div>}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Konfirmasi untuk tindakan yang dicatat (SweetAlert) ---------- */
export function ConfirmDialog({ open, title, items, permanent = true, confirmLabel, onConfirm, onCancel, pending, children }: {
  open: boolean; title: string; items?: [string, ReactNode][]; permanent?: boolean; confirmLabel: string; onConfirm: () => void; onCancel: () => void; pending?: boolean; children?: ReactNode;
}) {
  return (
    <AlertDialog open={open} onClose={pending ? () => undefined : onCancel} kind="question" title={title} text="Mohon periksa ringkasan berikut sebelum melanjutkan."
      actions={<><Button loading={pending} onClick={onConfirm}>{confirmLabel}</Button><Button variant="secondary" onClick={onCancel} disabled={pending}>Periksa kembali</Button></>}>
      <div className="space-y-3">
        {items && <InfoTable items={items} />}
        {children}
        {permanent
          ? <Notice tone="chain" title="Dicatat permanen">Data ini tidak dapat dihapus. Bila ada kekeliruan, perbaikan dilakukan melalui catatan koreksi baru beserta alasannya.</Notice>
          : <Notice tone="info">Data akan tersimpan dan jejak auditnya dicatat.</Notice>}
      </div>
    </AlertDialog>
  );
}

/* ---------- Isian formulir ---------- */
export interface FieldProps { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }
export function Field({ label, error, hint, required, children, className, layout }: { label: ReactNode; error?: string; hint?: ReactNode; required?: boolean; className?: string; layout?: 'stack' | 'horizontal'; children: (p: FieldProps) => ReactNode }) {
  const id = useId();
  const ctx = useContext(FormLayoutCtx);
  const horizontal = (layout ?? ctx) === 'horizontal';
  const dId = `${id}-d`;
  const lbl = <label htmlFor={id} className={cx('text-sm font-medium text-ink', horizontal ? 'sm:pt-2' : 'label')}>{label}{required && <span className="ml-0.5 text-bad" aria-hidden> *</span>}</label>;
  const body = (
    <div className="min-w-0">
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? dId : undefined })}
      {error ? <p id={dId} role="alert" className="mt-1 flex items-start gap-1.5 text-sm text-bad"><AlertTriangle size={14} className="mt-1 shrink-0" aria-hidden />{error}</p>
        : hint ? <p id={dId} className="mt-1 text-xs text-faint">{hint}</p> : null}
    </div>
  );
  if (!horizontal) return <div className={className}>{lbl}{body}</div>;
  return <div className={cx('grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,30%)_minmax(0,1fr)]', className)}>{lbl}{body}</div>;
}
/** Baris formulir horizontal (label kiri, isian kanan), terlepas dari konteks. */
export const FormRow = (p: Omit<Parameters<typeof Field>[0], 'layout'>) => <Field {...p} layout="horizontal" />;
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((p, r) => <input ref={r} {...p} className={cx('input', p.className)} />);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>((p, r) => <textarea ref={r} rows={3} {...p} className={cx('input', p.className)} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>((p, r) => <select ref={r} {...p} className={cx('input pr-8', p.className)} />);
Input.displayName = 'Input'; Textarea.displayName = 'Textarea'; Select.displayName = 'Select';

/* ---------- FileInput gaya Bootstrap: [Pilih File | Tidak ada file yang dipilih] ---------- */
export function FileInput({ label, accept, onChange, file, hint, disabled, required, error }: { label: ReactNode; accept?: string; file: File | null; onChange: (f: File | null) => void; hint?: ReactNode; disabled?: boolean; required?: boolean; error?: string | null }) {
  return (
    <Field label={label} required={required} hint={hint} error={error ?? undefined}>
      {(p) => (
        <div className={cx('flex min-h-[38px] items-stretch overflow-hidden rounded border bg-white text-sm focus-within:ring-2 focus-within:ring-navy-700/20', error ? 'border-bad' : 'border-slate-300 focus-within:border-navy-700', disabled && 'pointer-events-none opacity-50')}>
          <label htmlFor={p.id} className="flex cursor-pointer items-center border-r border-slate-300 bg-slate-100 px-3 font-medium text-ink hover:bg-slate-200">Pilih File</label>
          <span className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5">
            <span className={cx('truncate', file ? 'text-ink' : 'text-slate-500')} title={file?.name}>{file ? file.name : 'Tidak ada file yang dipilih'}</span>
            {file && <span className="shrink-0 text-xs text-faint">{(file.size / 1024).toFixed(1).replace('.', ',')} KB</span>}
            {file && <button type="button" onClick={() => onChange(null)} aria-label="Hapus berkas terpilih" className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded text-faint hover:bg-slate-100 hover:text-ink"><X size={14} /></button>}
          </span>
          <input {...p} type="file" accept={accept} disabled={disabled} className="sr-only" onChange={(e) => { onChange(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </div>
      )}
    </Field>
  );
}

/* ---------- Skeleton, EmptyState ---------- */
export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx('skeleton rounded', className ?? 'h-4 w-full')} />;
export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Memuat halaman">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      <Skeleton className="h-64" />
    </div>
  );
}
export function EmptyState({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
      {icon && <div className="mx-auto mb-2 text-slate-400">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ---------- Teknis: CopyableMono & TechnicalDetails ---------- */
export function CopyableMono({ value, head = 8, tail = 6, full }: { value?: string | null; head?: number; tail?: number; full?: boolean }) {
  const [ok, setOk] = useState(false);
  const copy = useCallback(async () => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); } catch {
      const t = document.createElement('textarea'); t.value = value; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setOk(true); setTimeout(() => setOk(false), 1500);
  }, [value]);
  if (!value) return <span className="text-faint">—</span>;
  const text = full || value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 align-middle">
      <code title={value} className={cx('font-mono text-xs text-slate-800', full && 'break-all')}>{text}</code>
      <button type="button" onClick={() => void copy()} aria-label={ok ? 'Tersalin' : `Salin ${value}`} title={ok ? 'Tersalin' : 'Salin'} className="grid h-6 w-6 place-items-center rounded text-faint hover:bg-white hover:text-navy-700">
        {ok ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
      </button>
    </span>
  );
}
export function TechnicalDetails({ items, title = 'Rincian teknis', defaultOpen }: { items: [string, ReactNode][]; title?: string; defaultOpen?: boolean }) {
  const visible = items.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!visible.length) return null;
  return (
    <details open={defaultOpen} className="group rounded border border-line bg-slate-50">
      <summary className="flex min-h-[36px] cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-navy-700 [&::-webkit-details-marker]:hidden">
        <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden />{title}
      </summary>
      <dl className="space-y-1.5 border-t border-line px-3 py-2.5 text-sm">
        {visible.map(([k, v]) => <div key={k} className="grid gap-1 sm:grid-cols-[9rem_1fr]"><dt className="text-faint">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>)}
      </dl>
    </details>
  );
}

/* ---------- Stepper horizontal ala smart-wizard: titik pada garis, label di bawah ---------- */
export interface StepItem { label: string; state: 'done' | 'current' | 'todo'; hint?: ReactNode }
export function StepIndicator({ steps, className }: { steps: StepItem[]; className?: string }) {
  return (
    <ol className={cx('relative flex', className)} aria-label="Langkah">
      <span aria-hidden className="absolute left-0 right-0 top-[7px] h-[3px] rounded bg-slate-200" />
      {steps.map((s, i) => (
        <li key={i} className="relative flex-1 px-1 text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
          <span className={cx('relative mx-auto block h-[17px] w-[17px] rounded-full border-[3px] border-white ring-0', s.state === 'current' ? 'bg-navy-700' : s.state === 'done' ? 'bg-ok' : 'bg-slate-400')} />
          <span className={cx('mt-2 block text-sm leading-snug', s.state === 'current' ? 'font-medium text-navy-700' : s.state === 'done' ? 'text-navy-700' : 'text-slate-600')}>
            <span className="block">Langkah {i + 1}</span>{s.label}
          </span>
          {s.hint && <span className="block text-xs text-faint">{s.hint}</span>}
        </li>
      ))}
    </ol>
  );
}
/** Bagian bernomor di dalam satu tugas: "1. Unggah LED". */
export function StepSection({ n, title, done, children, hint }: { n: number; title: string; done?: boolean; hint?: ReactNode; children?: ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 border-b border-line pb-1.5 text-[15px] font-medium">
        <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-medium text-white', done ? 'bg-ok' : 'bg-navy-700')}>{done ? <Check size={13} aria-hidden /> : n}</span>{title}
      </h3>
      {hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}

/* ---------- Tata letak halaman ---------- */
export interface Crumb { label: string; to?: string }
/** Baris judul ala Rocker: "Judul | rumah / Bagian / Halaman" di kiri, aksi utama di kanan. */
export function PageHeader({ title, crumbs = [], actions }: { title: ReactNode; crumbs?: Crumb[]; actions?: ReactNode }) {
  const { user } = useAuth();
  const home = user ? ROLE_HOME[user.role] : '/';
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-lg font-medium leading-snug sm:text-xl">{title}</h1>
        <span aria-hidden className="hidden h-5 w-px bg-slate-300 sm:block" />
        <nav aria-label="Jejak halaman" className="min-w-0">
          <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted">
            <li><Link to={home} aria-label="Beranda" className="inline-flex items-center text-navy-700 hover:text-navy-900"><Home size={15} aria-hidden /></Link></li>
            {crumbs.map((c, i) => (
              <li key={i} className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className="text-slate-400">/</span>
                {c.to && i < crumbs.length - 1 ? <Link to={c.to} className="truncate text-navy-700 hover:underline">{c.label}</Link> : <span className="max-w-[20rem] truncate" aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function DL({ items, cols = 2 }: { items: [string, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3 text-sm', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-3')}>
      {items.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-faint">{k}</dt><dd className="mt-0.5 break-words text-ink">{v ?? '—'}</dd></div>)}
    </dl>
  );
}
/** Tabel dua kolom "label : nilai" (ringkasan data). */
export function InfoTable({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="overflow-x-auto rounded border border-line">
      <table className="min-w-full text-sm">
        <tbody>
          {items.map(([k, v]) => (
            <tr key={k} className="border-b border-line last:border-b-0">
              <th scope="row" className="w-2/5 min-w-[9rem] bg-slate-50 px-3 py-2 text-left align-top font-medium text-slate-700 sm:w-1/3">{k}</th>
              <td className="break-words px-3 py-2 align-top text-ink">{v ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
/** Widget statistik: label kecil, angka besar, ikon pada kotak lembut di kanan, garis aksen kiri. */
const STAT_TONE = { primary: ['border-l-navy-700', 'bg-navy-50 text-navy-700'], warn: ['border-l-wait', 'bg-wait-bg text-wait'], success: ['border-l-ok', 'bg-ok-bg text-ok'], neutral: ['border-l-slate-400', 'bg-slate-100 text-slate-600'] } as const;
export function StatWidget({ label, value, hint, tone = 'primary', icon }: { label: string; value: ReactNode; hint?: string; tone?: keyof typeof STAT_TONE; icon?: ReactNode }) {
  const [border, box] = STAT_TONE[tone];
  return (
    <div className={cx('card flex items-center justify-between gap-3 border-l-4 px-4 py-3.5', border)}>
      <div className="min-w-0">
        <div className="text-sm text-muted">{label}</div>
        <div className="text-2xl font-medium leading-tight text-ink tabular-nums">{value}</div>
        {hint && <div className="text-xs text-faint">{hint}</div>}
      </div>
      <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded', box)} aria-hidden>{icon}</span>
    </div>
  );
}
export function ProgressBar({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className="h-2 w-full overflow-hidden rounded bg-slate-200"><div className={cx('h-full rounded transition-all', pct === 100 ? 'bg-ok' : 'bg-navy-700')} style={{ width: `${pct}%` }} /></div>;
}
