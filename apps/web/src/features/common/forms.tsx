import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Choice, ConfirmDialog, Field, FileInput, ModalActions, Textarea, useInDrawer } from '../../components/ui';

/**
 * Pola konfirmasi: formulir memvalidasi, lalu dialog meringkas data yang akan dicatat sebelum dikirim.
 * Di dalam Drawer tidak ada dialog kedua: catatan "tersimpan permanen" sudah tampil di footer panel, jadi langsung dijalankan.
 */
export function useConfirmed<V>(o: { run: (v: V) => void; pending: boolean; title: string; confirmLabel: string; summary: (v: V) => [string, ReactNode][]; permanent?: boolean }) {
  const inDrawer = useInDrawer();
  const [val, setVal] = useState<{ v: V } | null>(null);
  const was = useRef(false);
  useEffect(() => { if (was.current && !o.pending) setVal(null); was.current = o.pending; }, [o.pending]);
  if (inDrawer) return { ask: (v: V) => o.run(v), dialog: null };
  const dialog = (
    <ConfirmDialog open={!!val} title={o.title} confirmLabel={o.confirmLabel} permanent={o.permanent ?? true} pending={o.pending}
      items={val ? o.summary(val.v) : undefined} onCancel={() => setVal(null)} onConfirm={() => val && o.run(val.v)} />
  );
  return { ask: (v: V) => setVal({ v }), dialog };
}

export interface ChoiceOption { value: string; label: string; hint?: string }
/** Pilihan keputusan bergaya kartu besar (dibangun di atas Choice). */
export function RadioCards({ name, options, value, onChange, legend }: { name: string; options: ChoiceOption[]; value: string; onChange: (v: string) => void; legend: string }) {
  return <Choice name={name} legend={legend} options={options} value={value} onChange={onChange} />;
}

/** Bagian di dalam panel tindakan: judul polos, keterangan singkat, isi. */
export function FormSection({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <section>
      <h3 className="text-[14.5px] font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-[13.5px] text-faint">{hint}</p>}
      {children && <div className="mt-2">{children}</div>}
    </section>
  );
}

/** Daftar ringkas "label ... nilai" bergaris pemisah. */
export function KeyList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line rounded-xl border border-line text-[14.5px]">
      {items.map(([k, v], i) => <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5"><dt className="text-faint">{k}</dt><dd className="min-w-0 break-words text-right text-ink">{v ?? '—'}</dd></div>)}
    </dl>
  );
}

const optional = <span className="font-normal text-faint"> (opsional)</span>;

export function ResultNotesForm({ options, submitLabel, notesRequiredFor, notesLabel = 'Catatan', notesHint, notesPlaceholder, legend = 'Keputusan', onSubmit, pending, children }: {
  options: ChoiceOption[]; submitLabel: string; notesRequiredFor?: string[]; notesLabel?: string; notesHint?: string; notesPlaceholder?: string; legend?: string;
  onSubmit: (v: { result: string; notes: string }) => void; pending?: boolean; children?: ReactNode;
}) {
  const [result, setResult] = useState(options[0]?.value ?? '');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const fid = useId();
  const need = notesRequiredFor?.includes(result);
  return (
    <form id={fid} className="space-y-6" noValidate onSubmit={(e) => {
      e.preventDefault();
      if (need && notes.trim().length < 3) { setErr('Catatan wajib diisi untuk keputusan ini. Jelaskan alasan atau bagian yang perlu diperbaiki.'); return; }
      setErr(null);
      onSubmit({ result, notes: notes.trim() });
    }}>
      {children}
      <RadioCards name="result" legend={legend} options={options} value={result} onChange={(v) => { setResult(v); setErr(null); }} />
      <Field label={<>{notesLabel}{!need && optional}</>} required={need} hint={notesHint} error={err ?? undefined}>{(p) => <Textarea {...p} placeholder={notesPlaceholder} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <ModalActions><Button type="submit" form={fid} loading={pending}>{submitLabel}</Button></ModalActions>
    </form>
  );
}

export function NotesForm({ label = 'Catatan', hint, submitLabel, required, onSubmit, pending, variant, placeholder }: {
  label?: string; hint?: string; submitLabel: string; required?: boolean; onSubmit: (notes: string) => void; pending?: boolean; variant?: 'primary' | 'danger' | 'secondary'; placeholder?: string;
}) {
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const fid = useId();
  return (
    <form id={fid} className="space-y-4" noValidate onSubmit={(e) => {
      e.preventDefault();
      if (required && notes.trim().length < 3) { setErr('Kolom ini wajib diisi. Tuliskan uraian singkat.'); return; }
      setErr(null); onSubmit(notes.trim());
    }}>
      <Field label={<>{label}{!required && optional}</>} required={required} hint={hint} error={err ?? undefined}>{(p) => <Textarea {...p} placeholder={placeholder} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <ModalActions><Button type="submit" form={fid} variant={variant} loading={pending}>{submitLabel}</Button></ModalActions>
    </form>
  );
}

/** Unggah satu berkas. `footer`: tombol unggah dipindahkan ke footer panel/modal (bila formulir hanya berisi satu unggahan). */
export function SingleUpload({ label, submitLabel, onSubmit, pending, hint, disabled, footer }: {
  label: string; submitLabel: string; pending?: boolean; hint?: string; disabled?: boolean; footer?: boolean;
  onSubmit: (file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const fid = useId();
  const btn = <Button type="submit" form={fid} size={footer ? 'md' : 'sm'} disabled={!file || disabled} loading={pending}>{submitLabel}</Button>;
  return (
    <form id={fid} className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (file) { onSubmit(file); setFile(null); } }}>
      <FileInput label={label} hint={hint} file={file} disabled={disabled} onChange={setFile} accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.png,.jpg,.jpeg" />
      {footer ? <ModalActions>{btn}</ModalActions> : <div>{btn}</div>}
    </form>
  );
}
