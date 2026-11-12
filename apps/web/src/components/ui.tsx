import {
  forwardRef, useCallback, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Copy, FileUp, Info, Link2, Lock, Loader2, X, Clock, XCircle, Circle } from 'lucide-react';
import { AUDIT_STATUS_LABEL } from '../lib/labels';
import type { StepStatus } from '../lib/workflow';
import { STATUS_LABEL } from '../lib/workflow';
import type { AuditStatus } from '@akreditasi/shared';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-navy-700 text-white hover:bg-navy-800 active:bg-navy-900 shadow-sm',
  secondary: 'border border-slate-300 bg-white text-navy-900 hover:bg-navy-50 hover:border-navy-700',
  danger: 'bg-bad text-white hover:bg-red-800',
  ghost: 'text-navy-700 hover:bg-navy-50',
  accent: 'bg-navy-900 text-white hover:bg-navy-950 ring-1 ring-accent/60',
};
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, icon, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" {...rest} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'min-h-[36px] px-3 py-1.5 text-sm' : 'min-h-[40px] px-4 py-2 text-sm', VARIANTS[variant], className)}>
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : icon}
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
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold sm:text-lg">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

/* ---------- Badge & pills ---------- */
export type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger' | 'chain' | 'gold';
const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-info-bg text-info ring-info-line',
  success: 'bg-ok-bg text-ok ring-ok-line',
  warn: 'bg-wait-bg text-wait ring-wait-line',
  danger: 'bg-bad-bg text-bad ring-bad-line',
  chain: 'bg-chain-bg text-chain ring-chain-line',
  gold: 'bg-[#FBF5DC] text-[#7A5F00] ring-[#E8D58A]',
};
export function Badge({ tone = 'neutral', children, title, icon, className }: { tone?: Tone; children: ReactNode; title?: string; icon?: ReactNode; className?: string }) {
  return <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>{icon}{children}</span>;
}
const STEP_TONE: Record<StepStatus, Tone> = { selesai: 'success', aktif: 'info', menunggu: 'warn', terkunci: 'neutral', ditolak: 'danger' };
export function StatusPill({ status, label }: { status: StepStatus; label?: string }) {
  const Icon = status === 'selesai' ? CheckCircle2 : status === 'ditolak' ? XCircle : status === 'menunggu' ? Clock : status === 'terkunci' ? Lock : Circle;
  return <Badge tone={STEP_TONE[status]} icon={<Icon size={13} aria-hidden />}>{label ?? STATUS_LABEL[status]}</Badge>;
}
/** Bukti pencatatan: Tersimpan (abu), Tertunda (amber), Tercatat permanen (indigo), Gagal (merah). */
export function ProofBadge({ status }: { status?: AuditStatus | 'saved' | null }) {
  const s = status ?? 'saved';
  const label = AUDIT_STATUS_LABEL[s] ?? AUDIT_STATUS_LABEL.saved;
  if (s === 'committed') return <Badge tone="chain" icon={<Link2 size={13} aria-hidden />}>{label}</Badge>;
  if (s === 'pending') return <Badge tone="warn" icon={<span className="dot-pulse inline-block h-1.5 w-1.5 rounded-full bg-wait" aria-hidden />}>{label}</Badge>;
  if (s === 'failed') return <Badge tone="danger" icon={<XCircle size={13} aria-hidden />}>{label}</Badge>;
  return <Badge tone="neutral">{label}</Badge>;
}

/* ---------- Notice ---------- */
const NOTICE: Record<'info' | 'warn' | 'danger' | 'success' | 'chain', { cls: string; Icon: typeof Info }> = {
  info: { cls: 'border-info-line bg-info-bg text-slate-800', Icon: Info },
  warn: { cls: 'border-wait-line bg-wait-bg text-slate-800', Icon: AlertTriangle },
  danger: { cls: 'border-bad-line bg-bad-bg text-slate-800', Icon: XCircle },
  success: { cls: 'border-ok-line bg-ok-bg text-slate-800', Icon: CheckCircle2 },
  chain: { cls: 'border-chain-line bg-chain-bg text-slate-800', Icon: Link2 },
};
export function Notice({ tone = 'info', title, children, className }: { tone?: keyof typeof NOTICE; title?: string; children?: ReactNode; className?: string }) {
  const { cls, Icon } = NOTICE[tone];
  const color = tone === 'info' ? 'text-info' : tone === 'warn' ? 'text-wait' : tone === 'danger' ? 'text-bad' : tone === 'success' ? 'text-ok' : 'text-chain';
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={cx('flex gap-3 rounded-lg border px-4 py-3 text-sm', cls, className)}>
      <Icon size={18} className={cx('mt-0.5 shrink-0', color)} aria-hidden />
      <div className="min-w-0">{title && <p className="font-semibold text-ink">{title}</p>}{children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}</div>
    </div>
  );
}
export const FormError = ({ message }: { message?: string | null }) => (message ? <Notice tone="danger">{message}</Notice> : null);

/* ---------- Responsive table: tabel di layar lebar, kartu di layar sempit ---------- */
export interface Column<T> { key: string; header: string; cell: (row: T) => ReactNode; align?: 'left' | 'right'; primary?: boolean; className?: string }
export function DataTable<T>({ columns, rows, rowKey, caption, onRowClick }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; caption?: string; onRowClick?: (r: T) => void }) {
  const primary = columns.find((c) => c.primary) ?? columns[0]!;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-line sm:block">
        <table className="min-w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className={cx('whitespace-nowrap px-4 py-3', c.align === 'right' && 'text-right')}>{c.header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line bg-white">
            {rows.map((r) => (
              <tr key={rowKey(r)} className={cx('hover:bg-navy-50/60', onRowClick && 'cursor-pointer')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => <td key={c.key} className={cx('px-4 py-3 align-top', c.align === 'right' && 'text-right tabular-nums', c.className)}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 sm:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="rounded-lg border border-line bg-white p-4" onClick={onRowClick ? () => onRowClick(r) : undefined}>
            <div className="font-medium text-ink">{primary.cell(r)}</div>
            <dl className="mt-2 space-y-1.5">
              {columns.filter((c) => c !== primary && c.header).map((c) => (
                <div key={c.key} className="flex justify-between gap-3 text-sm"><dt className="shrink-0 text-faint">{c.header}</dt><dd className="min-w-0 text-right">{c.cell(r)}</dd></div>
              ))}
            </dl>
            {columns.filter((c) => !c.header).map((c) => <div key={c.key} className="mt-3">{c.cell(r)}</div>)}
          </li>
        ))}
      </ul>
    </>
  );
}

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
    onChange(n.id);
    document.getElementById(`tab-${n.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="no-print -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t, i) => (
        <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={t.id === value} aria-controls={`panel-${t.id}`} tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
            t.id === value ? 'border-navy-700 text-navy-900' : 'border-transparent text-muted hover:border-slate-300 hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className={cx('ml-2 rounded-full px-2 py-0.5 text-xs', t.id === value ? 'bg-navy-50 text-navy-700' : 'bg-slate-100 text-muted')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Modal & Drawer ---------- */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [open, onClose]);
  return ref;
}
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useDialog(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-navy-950/55 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id}
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={id} className="text-lg font-semibold">{title}</h2>
          <button type="button" aria-label="Tutup" onClick={onClose} className="rounded-lg p-2 text-faint hover:bg-slate-100 hover:text-ink"><X size={18} /></button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-slate-50 px-5 py-3 sm:rounded-b-2xl">{footer}</footer>}
      </div>
    </div>
  );
}
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useDialog(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-[60] bg-navy-950/55" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl outline-none">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={id} className="text-lg font-semibold">{title}</h2>
          <button type="button" aria-label="Tutup" onClick={onClose} className="rounded-lg p-2 text-faint hover:bg-slate-100 hover:text-ink"><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}

/* ---------- ConfirmDialog untuk tindakan yang dicatat permanen ---------- */
export function ConfirmDialog({ open, title, items, permanent = true, confirmLabel, onConfirm, onCancel, pending, children }: {
  open: boolean; title: string; items?: [string, ReactNode][]; permanent?: boolean; confirmLabel: string; onConfirm: () => void; onCancel: () => void; pending?: boolean; children?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={pending ? () => undefined : onCancel} title={title}
      footer={<><Button variant="secondary" onClick={onCancel} disabled={pending}>Periksa kembali</Button><Button loading={pending} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">Mohon periksa ringkasan berikut sebelum melanjutkan.</p>
        {items && <DL items={items} cols={1} />}
        {children}
        {permanent
          ? <Notice tone="chain" title="Dicatat permanen">Data yang Bapak/Ibu kirim akan tercatat permanen dan tidak dapat dihapus. Bila ada kekeliruan, perbaikan dilakukan melalui catatan koreksi baru yang disertai alasan.</Notice>
          : <Notice tone="info">Data akan tersimpan dan jejak auditnya dicatat.</Notice>}
      </div>
    </Modal>
  );
}

/* ---------- Form fields ---------- */
export interface FieldProps { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }
export function Field({ label, error, hint, required, children, className }: { label: string; error?: string; hint?: string; required?: boolean; className?: string; children: (p: FieldProps) => ReactNode }) {
  const id = useId();
  const dId = `${id}-d`;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}{required && <span className="ml-0.5 text-bad" aria-hidden> *</span>}</label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? dId : undefined })}
      {error ? <p id={dId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-bad"><AlertTriangle size={15} className="mt-1 shrink-0" aria-hidden />{error}</p>
        : hint ? <p id={dId} className="mt-1.5 text-sm text-faint">{hint}</p> : null}
    </div>
  );
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((p, r) => <input ref={r} {...p} className={cx('input', p.className)} />);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>((p, r) => <textarea ref={r} rows={3} {...p} className={cx('input', p.className)} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>((p, r) => <select ref={r} {...p} className={cx('input pr-8', p.className)} />);
Input.displayName = 'Input'; Textarea.displayName = 'Textarea'; Select.displayName = 'Select';

/* ---------- FileInput ---------- */
export function FileInput({ label, accept, onChange, file, hint, disabled }: { label: ReactNode; accept?: string; file: File | null; onChange: (f: File | null) => void; hint?: string; disabled?: boolean }) {
  const id = useId();
  const [over, setOver] = useState(false);
  return (
    <div>
      <span className="label">{label}</span>
      <label htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onChange(e.dataTransfer.files[0] ?? null); }}
        className={cx('flex cursor-pointer items-center gap-4 rounded-lg border-2 border-dashed px-4 py-4 text-sm transition-colors focus-within:ring-2 focus-within:ring-navy-700/40',
          over ? 'border-navy-700 bg-navy-50' : file ? 'border-ok bg-ok-bg' : 'border-slate-300 bg-white hover:bg-slate-50', disabled && 'pointer-events-none opacity-50')}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-700">{file ? <Check size={20} aria-hidden /> : <FileUp size={20} aria-hidden />}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink">{file ? file.name : 'Pilih berkas atau seret ke sini'}</span>
          <span className="block text-faint">{file ? `${(file.size / 1024).toFixed(1).replace('.', ',')} KB. Klik untuk mengganti.` : hint ?? 'Format PDF, DOC, DOCX, XLS, XLSX, ZIP, atau gambar'}</span>
        </span>
        <input id={id} type="file" accept={accept} disabled={disabled} className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  );
}

/* ---------- Skeleton, EmptyState ---------- */
export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx('skeleton rounded-md', className ?? 'h-4 w-full')} />;
export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Memuat halaman">
      <Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      <Skeleton className="h-64" />
    </div>
  );
}
export function EmptyState({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {icon && <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-navy-50 text-navy-700">{icon}</div>}
      <p className="font-display text-base font-semibold text-navy-900">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
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
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 align-middle">
      <code title={value} className={cx('font-mono text-[13px] text-slate-800', full && 'break-all')}>{text}</code>
      <button type="button" onClick={() => void copy()} aria-label={ok ? 'Tersalin' : `Salin ${value}`} title={ok ? 'Tersalin' : 'Salin'} className="rounded p-1 text-faint hover:bg-white hover:text-navy-700">
        {ok ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
      </button>
    </span>
  );
}
export function TechnicalDetails({ items, title = 'Rincian teknis', defaultOpen }: { items: [string, ReactNode][]; title?: string; defaultOpen?: boolean }) {
  const visible = items.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!visible.length) return null;
  return (
    <details open={defaultOpen} className="group rounded-lg border border-line bg-slate-50">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-navy-700 [&::-webkit-details-marker]:hidden">
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden />{title}
      </summary>
      <dl className="space-y-2 border-t border-line px-3 py-3 text-sm">
        {visible.map(([k, v]) => <div key={k} className="grid gap-1 sm:grid-cols-[9rem_1fr]"><dt className="text-faint">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>)}
      </dl>
    </details>
  );
}

/* ---------- Langkah bernomor ---------- */
export interface StepItem { label: string; state: 'done' | 'current' | 'todo'; hint?: ReactNode }
export function StepIndicator({ steps, className }: { steps: StepItem[]; className?: string }) {
  return (
    <ol className={cx('flex flex-wrap gap-x-6 gap-y-2', className)} aria-label="Langkah">
      {steps.map((s, i) => (
        <li key={i} className="flex items-center gap-2" aria-current={s.state === 'current' ? 'step' : undefined}>
          <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold',
            s.state === 'done' && 'bg-ok text-white', s.state === 'current' && 'bg-navy-700 text-white ring-4 ring-navy-100', s.state === 'todo' && 'bg-slate-200 text-muted')}>
            {s.state === 'done' ? <Check size={15} aria-hidden /> : i + 1}
          </span>
          <span className={cx('text-sm', s.state === 'current' ? 'font-semibold text-ink' : s.state === 'done' ? 'text-ink' : 'text-faint')}>{s.label}</span>
          {s.hint && <span className="text-xs text-faint">{s.hint}</span>}
        </li>
      ))}
    </ol>
  );
}
/** Bagian bernomor di dalam satu tugas: "1. Unggah LED". */
export function StepSection({ n, title, done, children, hint }: { n: number; title: string; done?: boolean; hint?: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative pl-12">
      <span className={cx('absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full text-sm font-semibold', done ? 'bg-ok text-white' : 'bg-navy-700 text-white')}>{done ? <Check size={16} aria-hidden /> : n}</span>
      <h3 className="text-base font-semibold leading-8">{title}</h3>
      {hint && <p className="mb-2 text-sm text-muted">{hint}</p>}
      {children && <div className="mt-2">{children}</div>}
    </section>
  );
}

/* ---------- Tata letak halaman ---------- */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-faint">{eyebrow}</div>}
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-base text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function DL({ items, cols = 2 }: { items: [string, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3 text-sm', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-3')}>
      {items.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-faint">{k}</dt><dd className="mt-0.5 break-words text-base text-ink">{v ?? '—'}</dd></div>)}
    </dl>
  );
}
export function Kpi({ label, value, hint, tone = 'neutral', icon }: { label: string; value: ReactNode; hint?: string; tone?: 'neutral' | 'primary' | 'success'; icon?: ReactNode }) {
  return (
    <div className={cx('card flex items-start gap-4 p-5', tone === 'primary' && 'border-navy-700 ring-1 ring-navy-700/20')}>
      <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-lg', tone === 'primary' ? 'bg-navy-700 text-white' : tone === 'success' ? 'bg-ok-bg text-ok' : 'bg-navy-50 text-navy-700')}>{icon}</span>
      <div className="min-w-0">
        <div className="text-sm text-muted">{label}</div>
        <div className="font-display text-3xl font-bold leading-tight text-navy-900 tabular-nums">{value}</div>
        {hint && <div className="mt-0.5 text-sm text-faint">{hint}</div>}
      </div>
    </div>
  );
}
export function ProgressBar({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className={cx('h-full rounded-full transition-all', pct === 100 ? 'bg-ok' : 'bg-navy-700')} style={{ width: `${pct}%` }} /></div>;
}
