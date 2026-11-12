import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-800',
  secondary: 'border border-navy-700 bg-white text-navy-800 hover:bg-navy-50',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  ghost: 'text-navy-800 hover:bg-navy-50',
  accent: 'bg-accent text-navy-900 hover:brightness-95',
};
export function Button({ variant = 'primary', loading, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx('inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50', VARIANTS[variant], className)}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <span role="status" aria-label="Memuat" className={cx('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', small ? 'h-4 w-4' : 'h-6 w-6 text-navy-700')} />;
}

/* ---------- Card ---------- */
export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-lg border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-navy-900">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ---------- Badge ---------- */
export type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger' | 'accent';
const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-navy-50 text-navy-800 ring-navy-100',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  accent: 'bg-accent/15 text-navy-900 ring-accent/40',
};
export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span title={title} className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone])}>{children}</span>;
}

/* ---------- Table ---------- */
export function Table({ head, children, caption }: { head: ReactNode[]; children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-800">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx('px-3 py-2 align-top', className)}>{children}</td>;

/* ---------- Modal & Drawer ---------- */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [open, onClose]);
  return ref;
}
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useDialog(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-navy-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id}
        className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-xl sm:rounded-xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <header className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <h2 id={id} className="text-base font-semibold text-navy-900">{title}</h2>
          <button aria-label="Tutup" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">✕</button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useDialog(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-navy-900/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl">
        <header className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <h2 id={id} className="text-base font-semibold text-navy-900">{title}</h2>
          <button aria-label="Tutup" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">✕</button>
        </header>
        <div className="p-4">{children}</div>
      </aside>
    </div>
  );
}

/* ---------- Form fields ---------- */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((p, r) => <input ref={r} {...p} className={cx('input', p.className)} />);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>((p, r) => <textarea ref={r} rows={3} {...p} className={cx('input', p.className)} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>((p, r) => <select ref={r} {...p} className={cx('input', p.className)} />);
Input.displayName = 'Input'; Textarea.displayName = 'Textarea'; Select.displayName = 'Select';

export function FormError({ message }: { message?: string | null }) {
  return message ? <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{message}</p> : null;
}

/* ---------- FileInput ---------- */
export function FileInput({ label, accept, onChange, file, hint }: { label: string; accept?: string; file: File | null; onChange: (f: File | null) => void; hint?: string }) {
  const id = useId();
  const [over, setOver] = useState(false);
  return (
    <div>
      <span className="label">{label}</span>
      <label htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onChange(e.dataTransfer.files[0] ?? null); }}
        className={cx('flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-3 py-5 text-center text-sm', over ? 'border-navy-700 bg-navy-50' : 'border-slate-300 bg-white hover:bg-slate-50')}>
        <span className="font-medium text-navy-800">{file ? file.name : 'Pilih berkas atau seret ke sini'}</span>
        <span className="text-xs text-slate-500">{file ? `${(file.size / 1024).toFixed(1)} KB` : hint ?? 'Maksimal sesuai ketentuan server'}</span>
        <input id={id} type="file" accept={accept} className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  );
}

/* ---------- Timeline & Stepper ---------- */
export interface TimelineItem { title: ReactNode; meta?: ReactNode; body?: ReactNode; tone?: Tone }
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative ml-2 border-l border-navy-100">
      {items.map((it, i) => (
        <li key={i} className="mb-4 ml-4">
          <span className={cx('absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ring-4 ring-white', it.tone === 'success' ? 'bg-emerald-600' : it.tone === 'danger' ? 'bg-red-600' : it.tone === 'warn' ? 'bg-amber-500' : 'bg-navy-700')} />
          <div className="text-sm font-medium text-navy-900">{it.title}</div>
          {it.meta && <div className="text-xs text-slate-500">{it.meta}</div>}
          {it.body && <div className="mt-1 text-sm text-slate-700">{it.body}</div>}
        </li>
      ))}
    </ol>
  );
}

export type StepState = 'done' | 'current' | 'todo' | 'blocked';
export function Stepper({ steps, orientation = 'vertical' }: { steps: { label: string; state: StepState; note?: ReactNode }[]; orientation?: 'vertical' | 'horizontal' }) {
  return (
    <ol className={cx('gap-2', orientation === 'horizontal' ? 'grid sm:grid-cols-2 lg:grid-cols-4' : 'flex flex-col')}>
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3" aria-current={s.state === 'current' ? 'step' : undefined}>
          <span className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
            s.state === 'done' && 'bg-emerald-600 text-white', s.state === 'current' && 'bg-navy-900 text-white ring-2 ring-accent',
            s.state === 'todo' && 'bg-slate-200 text-slate-600', s.state === 'blocked' && 'bg-red-600 text-white')}>
            {s.state === 'done' ? '✓' : s.state === 'blocked' ? '!' : i + 1}
          </span>
          <div className="min-w-0">
            <div className={cx('text-sm', s.state === 'current' ? 'font-semibold text-navy-900' : s.state === 'todo' ? 'text-slate-500' : 'text-slate-800')}>{s.label}</div>
            {s.note && <div className="text-xs text-slate-500">{s.note}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <p className="font-medium text-navy-900">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-semibold text-navy-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
export const DL = ({ items }: { items: [string, ReactNode][] }) => (
  <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
    {items.map(([k, v]) => <div key={k}><dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt><dd className="break-words text-slate-900">{v ?? '—'}</dd></div>)}
  </dl>
);
