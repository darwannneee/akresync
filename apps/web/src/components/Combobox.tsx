import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from './ui';

export interface ComboItem { value: string; label: string }
const LIMIT = 60;

/** Kotak isian dengan daftar yang dapat dicari. Nilai yang dikirim tetap id; teks bebas tidak dianggap pilihan. */
export function Combobox({ id, items, value, onChange, placeholder, loading, disabled, invalid, describedBy, emptyText = 'Tidak ada yang cocok.' }: {
  id?: string; items: ComboItem[]; value: string; onChange: (v: string) => void; placeholder?: string; loading?: boolean; disabled?: boolean;
  invalid?: boolean; describedBy?: string; emptyText?: string;
}) {
  const auto = useId();
  const listId = `${id ?? auto}-list`;
  const selected = useMemo(() => items.find((i) => i.value === value), [items, value]);
  const [text, setText] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setText(selected?.label ?? ''); }, [selected]);
  const matches = useMemo(() => {
    const terms = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (selected && text === selected.label) return items.slice(0, LIMIT);
    return items.filter((i) => { const l = i.label.toLowerCase(); return terms.every((t) => l.includes(t)); });
  }, [items, text, selected]);
  const shown = matches.slice(0, LIMIT);
  const pick = (i: ComboItem) => { onChange(i.value); setText(i.label); setOpen(false); };
  const close = () => { setOpen(false); setText(selected?.label ?? ''); };
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  });
  return (
    <div ref={ref} className="relative">
      <input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        aria-invalid={invalid || undefined} aria-describedby={describedBy} disabled={disabled}
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        className="input pr-9" placeholder={loading ? 'Memuat daftar…' : placeholder} value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); if (value) onChange(''); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && open) { e.preventDefault(); const i = shown[active]; if (i) pick(i); }
          else if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); close(); } }
          else if (e.key === 'Tab') close();
        }} />
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
      {open && !disabled && (
        <ul id={listId} role="listbox" className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg">
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted">{loading ? 'Memuat daftar…' : emptyText}</li>}
          {shown.map((i, n) => (
            <li key={i.value} id={`${listId}-${n}`} role="option" aria-selected={i.value === value}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }} onMouseEnter={() => setActive(n)}
              className={cx('cursor-pointer px-3 py-2 text-sm', n === active ? 'bg-navy-50 text-navy-900' : 'text-ink', i.value === value && 'font-semibold')}>
              {i.label}
            </li>
          ))}
          {matches.length > LIMIT && <li className="border-t border-line px-3 py-2 text-xs text-faint">Menampilkan {LIMIT} dari {matches.length} hasil. Ketik lebih lengkap untuk mempersempit.</li>}
        </ul>
      )}
    </div>
  );
}
