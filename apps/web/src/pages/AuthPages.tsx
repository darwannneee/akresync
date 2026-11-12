import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, FileLock2, Link2, ScrollText, ArrowLeft, ArrowRight, Compass, Download, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { ROLE_HOME } from '@akreditasi/shared';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../api/client';
import { Button, Field, FileInput, FormError, Input, Modal, Notice, Select, StepIndicator } from '../components/ui';
import { Combobox } from '../components/Combobox';
import { BrandMark } from '../components/Layout';
import { useInstitutions, useLevels, useProgramNames } from '../features/common/queries';

const POINTS = [
  { icon: Link2, title: 'Keputusan tercatat permanen', text: 'Setiap tahap resmi akreditasi dicatat sehingga tidak dapat diubah atau dihapus secara diam-diam.' },
  { icon: FileLock2, title: 'Dokumen tersimpan terenkripsi', text: 'LED, LKPS, dan berkas pendukung disimpan dalam keadaan terenkripsi dan dapat diperiksa keutuhannya.' },
  { icon: ScrollText, title: 'Jejak audit yang dapat diperiksa', text: 'Siapa melakukan apa dan kapan terekam jelas, sehingga seluruh proses dapat ditelusuri.' },
];

function SplitShell({ title, lead, children, footer, wide }: { title: string; lead: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between bg-navy-950 p-12 text-white lg:flex">
        <BrandMark light />
        <div>
          <h1 className="max-w-md font-display text-3xl font-bold leading-snug !text-white">Sistem Akreditasi Program Studi</h1>
          <p className="mt-3 max-w-md text-base text-navy-100">Pengajuan, penilaian, hingga penetapan peringkat dalam satu alur yang transparan dan dapat dipertanggungjawabkan.</p>
          <ul className="mt-10 space-y-6">
            {POINTS.map((p) => (
              <li key={p.title} className="flex max-w-md gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/10 text-accent"><p.icon size={22} aria-hidden /></span>
                <div><p className="font-semibold text-white">{p.title}</p><p className="text-sm text-navy-100">{p.text}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-navy-200">Untuk perwakilan UPPS, Sekretariat, Komite Evaluasi dan Akreditasi, Asesor, dan Majelis Akreditasi.</p>
      </aside>
      <main className={`flex justify-center bg-white px-6 py-10 sm:px-12 ${wide ? 'items-start' : 'items-center'}`}>
        <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
          <div className="mb-8 lg:hidden"><BrandMark /></div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="mt-1 text-base text-muted">{lead}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

const loginSchema = z.object({ email: z.string().min(1, 'Surel wajib diisi').email('Penulisan surel belum benar. Contoh: nama@kampus.ac.id'), password: z.string().min(1, 'Kata sandi wajib diisi') });
export function LoginPage() {
  const { user, signIn } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const f = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return (
    <SplitShell title="Masuk ke sistem" lead="Gunakan surel dan kata sandi yang terdaftar." footer={<>Perwakilan UPPS yang belum memiliki akun? <Link className="font-semibold text-navy-700 underline" to="/daftar">Daftar akun UPPS</Link></>}>
      <form className="space-y-5" noValidate onSubmit={f.handleSubmit(async (v) => {
        setErr(null);
        try { const u = await signIn(v.email, v.password); nav(ROLE_HOME[u.role], { replace: true }); } catch (e) { setErr(errorMessage(e)); }
      })}>
        <FormError message={err} />
        <Field label="Surel" required error={f.formState.errors.email?.message}>{(p) => <Input {...p} type="email" autoComplete="username" placeholder="nama@kampus.ac.id" {...f.register('email')} />}</Field>
        <Field label="Kata sandi" required error={f.formState.errors.password?.message}>{(p) => <Input {...p} type="password" autoComplete="current-password" {...f.register('password')} />}</Field>
        <Button type="submit" className="w-full" size="md" loading={f.formState.isSubmitting}>Masuk</Button>
      </form>
    </SplitShell>
  );
}

const TEMPLATE_SPPA = 'https://lamteknik.or.id/assets/template-surat-permohonan-pembuatan-akun-sakti.docx';
const TEMPLATE_SPSU = 'https://lamteknik.or.id/assets/template_surat-pernyataan-sebagai-upps-oleh-pimpinan-perguruan-tinggi.docx';
const MAX_PDF = 1024 * 1024;
const MAX_PHOTO = 500 * 1024;
const MIN_PASSWORD = 8;

const numOrEmpty = (min: number, max: number, label: string) =>
  z.string().trim().refine((v) => v === '' || (/^-?\d+([.,]\d+)?$/.test(v) && Number(v.replace(',', '.')) >= min && Number(v.replace(',', '.')) <= max), `${label} harus berupa angka antara ${min} dan ${max}`);
const step1Schema = z.object({
  uppsName: z.string().trim().min(2, 'Nama UPPS wajib diisi'),
  leaderName: z.string().trim().min(2, 'Nama pimpinan tertinggi UPPS wajib diisi, lengkap dengan gelar akademik'),
  picName: z.string().trim().min(2, 'Nama penanggung jawab akun wajib diisi'),
  email: z.string().trim().min(1, 'Surel wajib diisi').email('Penulisan surel belum benar. Contoh: nama@kampus.ac.id'),
  phone: z.string().trim().refine((v) => v === '' || /^[0-9+()\-\s]{6,25}$/.test(v), 'Nomor telepon hanya boleh berisi angka, spasi, tanda +, -, dan tanda kurung'),
  institutionId: z.string().min(1, 'Pilih institusi Bapak/Ibu dari daftar'),
  password: z.string().min(MIN_PASSWORD, `Kata sandi minimal ${MIN_PASSWORD} karakter. Gunakan kombinasi huruf dan angka.`).max(200),
  confirmPassword: z.string().min(1, 'Ulangi kata sandi untuk konfirmasi'),
}).refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Konfirmasi kata sandi tidak sama dengan kata sandi' });
const programRow = z.object({
  levelId: z.string().min(1, 'Pilih jenjang'),
  programNameId: z.string().min(1, 'Pilih program studi dari daftar'),
  headName: z.string().trim().max(200),
  location: z.string().trim().max(300),
  lat: numOrEmpty(-90, 90, 'Lintang'),
  lng: numOrEmpty(-180, 180, 'Bujur'),
});
const step2Schema = z.object({ programs: z.array(programRow).min(1, 'Tambahkan minimal satu program studi') }).superRefine((v, ctx) => {
  const seen = new Set<string>();
  v.programs.forEach((p, i) => {
    if (!p.levelId || !p.programNameId) return;
    const k = `${p.levelId}:${p.programNameId}`;
    if (seen.has(k)) ctx.addIssue({ code: 'custom', path: ['programs', i, 'programNameId'], message: 'Program studi dan jenjang ini sudah ditambahkan pada baris lain' });
    seen.add(k);
  });
});
const step3Schema = z.object({ terms: z.literal(true, { errorMap: () => ({ message: 'Ketentuan dan persyaratan harus disetujui untuk melanjutkan' }) }) });
const STEP_SCHEMAS = [step1Schema, step2Schema, step3Schema] as const;
interface RegValues {
  uppsName: string; leaderName: string; picName: string; email: string; phone: string; institutionId: string; password: string; confirmPassword: string;
  programs: { levelId: string; programNameId: string; headName: string; location: string; lat: string; lng: string }[];
  terms: boolean;
}
const EMPTY_ROW = { levelId: '', programNameId: '', headName: '', location: '', lat: '', lng: '' };
const kb = (n: number) => `${(n / 1024).toFixed(1).replace('.', ',')} KB`;

type FileKey = 'photo' | 'sppa' | 'spsu';
function checkFile(kind: FileKey, f: File): string | null {
  if (kind === 'photo') {
    if (!/\.jpe?g$/i.test(f.name) || (f.type && f.type !== 'image/jpeg')) return 'Foto harus berformat JPG atau JPEG.';
    if (f.size > MAX_PHOTO) return `Ukuran foto ${kb(f.size)} melebihi batas 500 KB. Perkecil ukuran foto lalu pilih kembali.`;
  } else {
    if (!/\.pdf$/i.test(f.name) || (f.type && f.type !== 'application/pdf')) return 'Berkas harus berformat PDF.';
    if (f.size > MAX_PDF) return `Ukuran berkas ${kb(f.size)} melebihi batas 1 MB. Perkecil ukuran berkas lalu pilih kembali.`;
  }
  return null;
}

function UppsInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Apa itu UPPS?" footer={<Button onClick={onClose}>Tutup</Button>}>
      <p className="text-base">Unit Pengelola Program Studi (UPPS) adalah unit di perguruan tinggi, fakultas, atau departemen yang ditunjuk melalui surat keputusan pimpinan perguruan tinggi untuk mengelola program studi dan mempersiapkan proses akreditasi.</p>
    </Modal>
  );
}
function TermsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Ketentuan dan persyaratan registrasi akun UPPS" footer={<Button onClick={onClose}>Saya sudah membaca</Button>}>
      <ol className="list-decimal space-y-2 pl-5 text-base">
        <li>Registrasi hanya dilakukan oleh perwakilan resmi UPPS yang ditunjuk oleh pimpinan perguruan tinggi.</li>
        <li>Seluruh data dan dokumen yang diunggah harus benar, terbaru, dan dapat dipertanggungjawabkan. Data yang tidak sesuai dapat menyebabkan pendaftaran ditolak.</li>
        <li>Akun baru aktif setelah dokumen registrasi diverifikasi oleh Sekretariat Administrasi LAM Teknik. Hasil verifikasi, termasuk alasan penolakan bila ada, disampaikan saat masuk ke sistem.</li>
        <li>Pemegang akun wajib menjaga kerahasiaan kata sandi dan bertanggung jawab atas seluruh tindakan yang dilakukan melalui akunnya.</li>
        <li>Dokumen yang diunggah disimpan terenkripsi dan hanya digunakan untuk keperluan verifikasi dan proses akreditasi.</li>
      </ol>
    </Modal>
  );
}

function FileField({ label, file, error, accept, hint, onPick, optional }: { label: string; file: File | null; error?: string | null; accept: string; hint: string; onPick: (f: File | null) => void; optional?: boolean }) {
  return (
    <div>
      <FileInput label={<>{label}{!optional && <span className="ml-0.5 text-bad" aria-hidden> *</span>}</>} accept={accept} file={file} hint={hint} onChange={onPick} />
      {file && <button type="button" onClick={() => onPick(null)} className="mt-1 text-sm font-medium text-navy-700 underline">Hapus berkas</button>}
      {error && <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-bad"><AlertTriangle size={15} className="mt-1 shrink-0" aria-hidden />{error}</p>}
    </div>
  );
}

export function RegisterPage() {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const stepRef = useRef(1);
  stepRef.current = step;
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [files, setFiles] = useState<Record<FileKey, File | null>>({ photo: null, sppa: null, spsu: null });
  const [fileErr, setFileErr] = useState<Record<FileKey, string | null>>({ photo: null, sppa: null, spsu: null });
  const [infoOpen, setInfoOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const insts = useInstitutions();
  const levels = useLevels();
  const names = useProgramNames();
  const f = useForm<RegValues>({
    resolver: ((v: RegValues, c: unknown, o: never) => zodResolver(STEP_SCHEMAS[stepRef.current - 1] as never)(v as never, c, o)) as never,
    defaultValues: { uppsName: '', leaderName: '', picName: '', email: '', phone: '', institutionId: '', password: '', confirmPassword: '', programs: [{ ...EMPTY_ROW }], terms: false },
  });
  const rows = useFieldArray({ control: f.control, name: 'programs' });
  const e = f.formState.errors;
  const instItems = useMemo(() => (insts.data ?? []).map((i) => ({ value: i.id, label: i.name })), [insts.data]);
  const nameItems = useMemo(() => (names.data ?? []).map((n) => ({ value: String(n.id), label: n.name })), [names.data]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step, done]);
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const pick = (k: FileKey, file: File | null) => {
    setFiles((x) => ({ ...x, [k]: file }));
    setFileErr((x) => ({ ...x, [k]: file ? checkFile(k, file) : null }));
  };
  const next = async () => {
    if (!(await f.trigger())) return;
    setStep((s) => (s < 3 ? ((s + 1) as 2 | 3) : s));
  };
  // Resolver hanya mengembalikan nilai langkah aktif; data lengkap diambil dari getValues.
  const submit = f.handleSubmit(async () => {
    const v = f.getValues();
    setErr(null);
    const fe: Record<FileKey, string | null> = {
      photo: files.photo ? checkFile('photo', files.photo) : null,
      sppa: files.sppa ? checkFile('sppa', files.sppa) : 'Unggah Surat Pengajuan Permohonan Akun dalam format PDF.',
      spsu: files.spsu ? checkFile('spsu', files.spsu) : 'Unggah Surat Pernyataan sebagai UPPS dalam format PDF.',
    };
    setFileErr(fe);
    if (fe.photo || fe.sppa || fe.spsu) return;
    const form = new FormData();
    const t = (x: string) => x.trim();
    form.append('uppsName', t(v.uppsName)); form.append('leaderName', t(v.leaderName)); form.append('picName', t(v.picName));
    form.append('email', t(v.email)); form.append('phone', t(v.phone)); form.append('institutionId', v.institutionId);
    form.append('password', v.password); form.append('termsAccepted', 'true');
    form.append('programs', JSON.stringify(v.programs.map((p) => ({
      levelId: Number(p.levelId), programNameId: Number(p.programNameId), headName: t(p.headName), location: t(p.location),
      lat: t(p.lat) === '' ? '' : Number(t(p.lat).replace(',', '.')), lng: t(p.lng) === '' ? '' : Number(t(p.lng).replace(',', '.')),
    }))));
    if (files.photo) form.append('photo', files.photo);
    form.append('sppa', files.sppa!); form.append('spsu', files.spsu!);
    try { await api.upload('/auth/register', form); setDone(true); } catch (x) { setErr(errorMessage(x)); }
  });

  if (done) {
    return (
      <SplitShell wide title="Pendaftaran diterima" lead="Terima kasih. Data dan dokumen registrasi Bapak/Ibu telah kami terima." footer={<Link className="font-semibold text-navy-700 underline" to="/masuk">Kembali ke halaman masuk</Link>}>
        <div className="space-y-4">
          <Notice tone="success" title="Pendaftaran diterima">Pendaftaran diterima. Akun Bapak/Ibu akan aktif setelah diverifikasi Sekretariat Administrasi LAM Teknik.</Notice>
          <p className="text-base text-muted">Bapak/Ibu belum dapat masuk ke sistem sebelum verifikasi selesai. Hasil verifikasi akan terlihat saat Bapak/Ibu mencoba masuk dengan surel dan kata sandi yang telah didaftarkan.</p>
        </div>
      </SplitShell>
    );
  }

  return (
    <SplitShell wide title="Pendaftaran akun UPPS" lead="Akun ini digunakan perwakilan UPPS untuk mengajukan akreditasi. Pendaftaran akan diverifikasi oleh Sekretariat Administrasi." footer={<Link className="font-semibold text-navy-700 underline" to="/masuk">Kembali ke halaman masuk</Link>}>
      <button type="button" onClick={() => setInfoOpen(true)} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 underline"><HelpCircle size={16} aria-hidden />Apa itu UPPS?</button>
      <StepIndicator className="mb-6" steps={[
        { label: 'Profil UPPS', state: step === 1 ? 'current' : 'done' },
        { label: 'Jenjang dan program studi', state: step === 2 ? 'current' : step > 2 ? 'done' : 'todo' },
        { label: 'Dokumen registrasi', state: step === 3 ? 'current' : 'todo' },
      ]} />
      <form className="space-y-5" noValidate onSubmit={(ev) => { ev.preventDefault(); if (step < 3) void next(); else void submit(); }}>
        <FormError message={err} />
        {step === 1 && (
          <>
            <Field label="Nama UPPS" required error={e.uppsName?.message} hint="Contoh: Fakultas Teknik Universitas Contoh.">{(p) => <Input {...p} {...f.register('uppsName')} />}</Field>
            <Field label="Nama Pimpinan Tertinggi UPPS" required error={e.leaderName?.message}>{(p) => <Input {...p} placeholder="Masukkan nama lengkap pimpinan tertinggi beserta gelar akademik" {...f.register('leaderName')} />}</Field>
            <Field label="Penanggung Jawab Akun" required error={e.picName?.message} hint="Nama petugas yang akan menggunakan akun ini.">{(p) => <Input {...p} autoComplete="name" {...f.register('picName')} />}</Field>
            <Field label="Surel" required error={e.email?.message}>{(p) => <Input {...p} type="email" autoComplete="email" placeholder="nama@kampus.ac.id" {...f.register('email')} />}</Field>
            <Field label="Telepon" error={e.phone?.message} hint="Opsional.">{(p) => <Input {...p} type="tel" autoComplete="tel" {...f.register('phone')} />}</Field>
            <Field label="Institusi" required error={e.institutionId?.message} hint="Institusi yang dicari tidak ditemukan? Hubungi Sekretariat LAM Teknik.">
              {(p) => <Controller control={f.control} name="institutionId" render={({ field }) => <Combobox id={p.id} items={instItems} value={field.value} onChange={field.onChange} loading={insts.isLoading} placeholder="Ketik untuk mencari institusi" invalid={!!e.institutionId} describedBy={p['aria-describedby']} />} />}
            </Field>
            <Field label="Kata Sandi" required error={e.password?.message} hint={`Minimal ${MIN_PASSWORD} karakter.`}>{(p) => <Input {...p} type="password" autoComplete="new-password" {...f.register('password')} />}</Field>
            <Field label="Konfirmasi Kata Sandi" required error={e.confirmPassword?.message}>{(p) => <Input {...p} type="password" autoComplete="new-password" {...f.register('confirmPassword')} />}</Field>
          </>
        )}
        {step === 2 && (
          <>
            <p className="text-base text-muted">Tambahkan jenjang dan program studi yang berada di bawah pengelolaan UPPS ini. Program studi yang Bapak/Ibu daftarkan akan dapat dipilih saat mengajukan akreditasi setelah akun disetujui.</p>
            {(levels.isError || names.isError) && <Notice tone="danger">Daftar jenjang atau program studi tidak dapat dimuat. Muat ulang halaman.</Notice>}
            {typeof e.programs?.message === 'string' && <Notice tone="danger">{e.programs.message}</Notice>}
            {rows.fields.map((row, i) => {
              const re = e.programs?.[i];
              return (
                <fieldset key={row.id} className="space-y-4 rounded-xl border border-line bg-surface p-4">
                  <legend className="px-1 text-sm font-semibold text-navy-900">Program studi {i + 1}</legend>
                  <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                    <Field label="Jenjang" required error={re?.levelId?.message}>
                      {(p) => <Select {...p} {...f.register(`programs.${i}.levelId`)}><option value="">{levels.isLoading ? 'Memuat…' : 'Pilih jenjang'}</option>{levels.data?.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</Select>}
                    </Field>
                    <Field label="Prodi" required error={re?.programNameId?.message} hint="Prodi yang dicari tidak ditemukan? Hubungi Sekretariat LAM Teknik.">
                      {(p) => <Controller control={f.control} name={`programs.${i}.programNameId`} render={({ field }) => <Combobox id={p.id} items={nameItems} value={field.value} onChange={field.onChange} loading={names.isLoading} placeholder="Ketik untuk mencari program studi" invalid={!!re?.programNameId} describedBy={p['aria-describedby']} />} />}
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Ketua Prodi" error={re?.headName?.message} hint="Opsional.">{(p) => <Input {...p} {...f.register(`programs.${i}.headName`)} />}</Field>
                    <Field label="Letak Prodi" error={re?.location?.message} hint="Alamat atau kota tempat prodi berada. Opsional.">{(p) => <Input {...p} {...f.register(`programs.${i}.location`)} />}</Field>
                    <Field label="Lintang (opsional)" error={re?.lat?.message} hint="Contoh: -6,914744">{(p) => <Input {...p} inputMode="decimal" {...f.register(`programs.${i}.lat`)} />}</Field>
                    <Field label="Bujur (opsional)" error={re?.lng?.message} hint="Contoh: 107,609810">{(p) => <Input {...p} inputMode="decimal" {...f.register(`programs.${i}.lng`)} />}</Field>
                  </div>
                  {rows.fields.length > 1 && <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => rows.remove(i)} icon={<Trash2 size={16} />}>Hapus program studi {i + 1}</Button></div>}
                </fieldset>
              );
            })}
            <Button variant="secondary" onClick={() => rows.append({ ...EMPTY_ROW })} icon={<Plus size={16} />}>Tambah</Button>
          </>
        )}
        {step === 3 && (
          <>
            <p className="text-base text-muted">Unggah dokumen berikut. Surat dibuat mengikuti templat resmi, ditandatangani, lalu dipindai dalam format PDF.</p>
            <FileField label="Foto Penanggung Jawab" optional accept=".jpg,.jpeg,image/jpeg" file={files.photo} error={fileErr.photo} hint="Opsional. Format JPG/JPEG, maksimal 500 KB." onPick={(x) => pick('photo', x)} />
            <div>
              <FileField label="Surat Pengajuan Permohonan Akun" accept=".pdf,application/pdf" file={files.sppa} error={fileErr.sppa} hint="Format PDF, maksimal 1 MB." onPick={(x) => pick('sppa', x)} />
              <a href={TEMPLATE_SPPA} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 underline"><Download size={15} aria-hidden />Unduh templat surat permohonan akun</a>
            </div>
            <div>
              <FileField label="Surat Pernyataan sebagai UPPS oleh Pimpinan Perguruan Tinggi" accept=".pdf,application/pdf" file={files.spsu} error={fileErr.spsu} hint="Format PDF, maksimal 1 MB." onPick={(x) => pick('spsu', x)} />
              <a href={TEMPLATE_SPSU} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 underline"><Download size={15} aria-hidden />Unduh templat surat pernyataan sebagai UPPS</a>
            </div>
            <div>
              <label className="flex cursor-pointer items-start gap-3 text-base">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-navy-700" aria-invalid={e.terms ? true : undefined} {...f.register('terms')} />
                <span>Dengan melakukan registrasi akun UPPS, saya menyatakan telah membaca dan menerima <button type="button" onClick={() => setTermsOpen(true)} className="font-semibold text-navy-700 underline">ketentuan dan persyaratan yang berlaku</button>.</span>
              </label>
              {e.terms?.message && <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-bad"><AlertTriangle size={15} className="mt-1 shrink-0" aria-hidden />{e.terms.message}</p>}
            </div>
          </>
        )}
        <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-5">
          {step > 1 ? <Button variant="secondary" onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2) : s))} icon={<ArrowLeft size={16} />}>Sebelumnya</Button> : <span />}
          {step < 3
            ? <Button onClick={() => void next()} icon={<ArrowRight size={16} />}>Selanjutnya</Button>
            : <Button type="submit" loading={f.formState.isSubmitting}>Daftar sebagai UPPS</Button>}
        </div>
      </form>
      <UppsInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </SplitShell>
  );
}

export function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-surface px-6 text-center">
      <div className="max-w-md">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-navy-50 text-navy-700"><Compass size={28} aria-hidden /></span>
        <p className="font-display text-sm font-semibold tracking-widest text-faint">KODE 404</p>
        <h1 className="mt-1 text-2xl font-bold">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-base text-muted">Alamat yang Bapak/Ibu tuju tidak tersedia atau sudah dipindahkan. Silakan kembali ke beranda dan lanjutkan dari menu.</p>
        <Link to="/" className="mt-6 inline-flex min-h-[40px] items-center rounded-lg bg-navy-700 px-5 py-2 text-sm font-medium text-white hover:bg-navy-800">Kembali ke beranda</Link>
      </div>
    </div>
  );
}
