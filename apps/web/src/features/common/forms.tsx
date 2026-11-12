import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, ConfirmDialog, Field, FileInput, Textarea, cx } from '../../components/ui';

/** Pola konfirmasi: formulir memvalidasi, lalu dialog meringkas data yang akan dicatat sebelum dikirim. */
export function useConfirmed<V>(o: { run: (v: V) => void; pending: boolean; title: string; confirmLabel: string; summary: (v: V) => [string, ReactNode][]; permanent?: boolean }) {
  const [val, setVal] = useState<{ v: V } | null>(null);
  const was = useRef(false);
  useEffect(() => { if (was.current && !o.pending) setVal(null); was.current = o.pending; }, [o.pending]);
  const dialog = (
    <ConfirmDialog open={!!val} title={o.title} confirmLabel={o.confirmLabel} permanent={o.permanent ?? true} pending={o.pending}
      items={val ? o.summary(val.v) : undefined} onCancel={() => setVal(null)} onConfirm={() => val && o.run(val.v)} />
  );
  return { ask: (v: V) => setVal({ v }), dialog };
}

export interface ChoiceOption { value: string; label: string; hint?: string }
export function RadioCards({ name, options, value, onChange, legend }: { name: string; options: ChoiceOption[]; value: string; onChange: (v: string) => void; legend: string }) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.value} className={cx('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-navy-700/40', value === o.value ? 'border-navy-700 bg-navy-50' : 'border-slate-300 bg-white hover:bg-slate-50')}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1 h-4 w-4 accent-navy-700" />
            <span><span className="block font-medium text-ink">{o.label}</span>{o.hint && <span className="block text-sm text-muted">{o.hint}</span>}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ResultNotesForm({ options, submitLabel, notesRequiredFor, notesLabel = 'Catatan', notesHint, legend = 'Keputusan Bapak/Ibu', onSubmit, pending, children }: {
  options: ChoiceOption[]; submitLabel: string; notesRequiredFor?: string[]; notesLabel?: string; notesHint?: string; legend?: string;
  onSubmit: (v: { result: string; notes: string }) => void; pending?: boolean; children?: ReactNode;
}) {
  const [result, setResult] = useState(options[0]?.value ?? '');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const need = notesRequiredFor?.includes(result);
  return (
    <form className="space-y-4" noValidate onSubmit={(e) => {
      e.preventDefault();
      if (need && notes.trim().length < 3) { setErr('Catatan wajib diisi untuk keputusan ini. Jelaskan alasan atau bagian yang perlu diperbaiki.'); return; }
      setErr(null);
      onSubmit({ result, notes: notes.trim() });
    }}>
      {children}
      <RadioCards name="result" legend={legend} options={options} value={result} onChange={(v) => { setResult(v); setErr(null); }} />
      <Field label={notesLabel} required={need} hint={notesHint ?? (need ? undefined : 'Opsional.')} error={err ?? undefined}>{(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <Button type="submit" loading={pending}>{submitLabel}</Button>
    </form>
  );
}

export function NotesForm({ label = 'Catatan', hint, submitLabel, required, onSubmit, pending, variant, placeholder }: {
  label?: string; hint?: string; submitLabel: string; required?: boolean; onSubmit: (notes: string) => void; pending?: boolean; variant?: 'primary' | 'danger' | 'secondary'; placeholder?: string;
}) {
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="space-y-4" noValidate onSubmit={(e) => {
      e.preventDefault();
      if (required && notes.trim().length < 3) { setErr('Kolom ini wajib diisi. Tuliskan uraian singkat.'); return; }
      setErr(null); onSubmit(notes.trim());
    }}>
      <Field label={label} required={required} hint={hint ?? (required ? undefined : 'Opsional.')} error={err ?? undefined}>{(p) => <Textarea {...p} placeholder={placeholder} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <Button type="submit" variant={variant} loading={pending}>{submitLabel}</Button>
    </form>
  );
}

export function SingleUpload({ label, submitLabel, onSubmit, pending, hint, disabled }: {
  label: string; submitLabel: string; pending?: boolean; hint?: string; disabled?: boolean;
  onSubmit: (file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (file) { onSubmit(file); setFile(null); } }}>
      <FileInput label={label} hint={hint} file={file} disabled={disabled} onChange={setFile} accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.png,.jpg,.jpeg" />
      <Button type="submit" disabled={!file || disabled} loading={pending}>{submitLabel}</Button>
    </form>
  );
}
