import { useState, type ReactNode } from 'react';
import { Button, Field, FileInput, Select, Textarea } from '../../components/ui';

export function ResultNotesForm({ options, submitLabel, notesRequiredFor, notesLabel = 'Catatan', onSubmit, pending, children }: {
  options: { value: string; label: string }[];
  submitLabel: string;
  notesRequiredFor?: string[];
  notesLabel?: string;
  onSubmit: (v: { result: string; notes: string }) => void;
  pending?: boolean;
  children?: ReactNode;
}) {
  const [result, setResult] = useState(options[0]?.value ?? '');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const need = notesRequiredFor?.includes(result);
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      if (need && notes.trim().length < 3) { setErr('Catatan wajib diisi untuk pilihan ini.'); return; }
      setErr(null);
      onSubmit({ result, notes: notes.trim() });
    }}>
      {children}
      <Field label="Keputusan">{(id) => <Select id={id} value={result} onChange={(e) => setResult(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}</Field>
      <Field label={notesLabel + (need ? ' (wajib)' : '')} error={err ?? undefined}>{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <Button type="submit" loading={pending}>{submitLabel}</Button>
    </form>
  );
}

export function NotesForm({ label = 'Catatan', submitLabel, required, onSubmit, pending, variant }: {
  label?: string; submitLabel: string; required?: boolean; onSubmit: (notes: string) => void; pending?: boolean; variant?: 'primary' | 'danger' | 'secondary';
}) {
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      if (required && notes.trim().length < 3) { setErr('Isian wajib diisi.'); return; }
      setErr(null); onSubmit(notes.trim());
    }}>
      <Field label={label} error={err ?? undefined}>{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <Button type="submit" variant={variant} loading={pending}>{submitLabel}</Button>
    </form>
  );
}

export function SingleUpload({ label, submitLabel, onSubmit, pending, docTypes }: {
  label: string; submitLabel: string; pending?: boolean;
  docTypes?: { value: string; label: string }[];
  onSubmit: (file: File, docType?: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState(docTypes?.[0]?.value ?? '');
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (file) { onSubmit(file, type || undefined); setFile(null); } }}>
      {docTypes && <Field label="Jenis dokumen">{(id) => <Select id={id} value={type} onChange={(e) => setType(e.target.value)}>{docTypes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}</Field>}
      <FileInput label={label} file={file} onChange={setFile} accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.png,.jpg,.jpeg" />
      <Button type="submit" disabled={!file} loading={pending}>{submitLabel}</Button>
    </form>
  );
}
