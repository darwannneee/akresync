import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FileLock2, Link2, ScrollText, ArrowLeft, ArrowRight, Compass } from 'lucide-react';
import { ROLE_HOME } from '@akreditasi/shared';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../api/client';
import { Button, Field, FormError, Input, Select, StepIndicator } from '../components/ui';
import { BrandMark } from '../components/Layout';
import { useInstitutions, usePrograms } from '../features/common/queries';
import { useToast } from '../components/Toast';

const POINTS = [
  { icon: Link2, title: 'Keputusan tercatat permanen', text: 'Setiap tahap resmi akreditasi dicatat sehingga tidak dapat diubah atau dihapus secara diam-diam.' },
  { icon: FileLock2, title: 'Dokumen tersimpan terenkripsi', text: 'LED, LKPS, dan berkas pendukung disimpan dalam keadaan terenkripsi dan dapat diperiksa keutuhannya.' },
  { icon: ScrollText, title: 'Jejak audit yang dapat diperiksa', text: 'Siapa melakukan apa dan kapan terekam jelas, sehingga seluruh proses dapat ditelusuri.' },
];

function SplitShell({ title, lead, children, footer }: { title: string; lead: string; children: ReactNode; footer?: ReactNode }) {
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
      <main className="flex items-center justify-center bg-white px-6 py-10 sm:px-12">
        <div className="w-full max-w-md">
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

const accountSchema = z.object({
  fullName: z.string().trim().min(3, 'Nama lengkap wajib diisi, minimal 3 huruf'),
  email: z.string().email('Penulisan surel belum benar. Contoh: nama@kampus.ac.id'),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter. Gunakan kombinasi huruf dan angka.'),
});
const regSchema = accountSchema.extend({
  institutionId: z.string().min(1, 'Pilih institusi Bapak/Ibu'),
  programId: z.string().min(1, 'Pilih program studi yang akan diajukan'),
});
export function RegisterPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [err, setErr] = useState<string | null>(null);
  const f = useForm<z.infer<typeof regSchema>>({ resolver: zodResolver(regSchema), defaultValues: { institutionId: '', programId: '' } });
  const inst = f.watch('institutionId');
  const insts = useInstitutions();
  const progs = usePrograms(inst);
  const e = f.formState.errors;
  const next = async () => { if (await f.trigger(['fullName', 'email', 'password'])) setStep(2); };
  return (
    <SplitShell title="Pendaftaran akun UPPS" lead="Akun ini digunakan perwakilan UPPS untuk mengajukan akreditasi." footer={<Link className="font-semibold text-navy-700 underline" to="/masuk">Kembali ke halaman masuk</Link>}>
      <StepIndicator className="mb-6" steps={[{ label: 'Data akun', state: step === 1 ? 'current' : 'done' }, { label: 'Institusi dan program studi', state: step === 2 ? 'current' : 'todo' }]} />
      <form className="space-y-5" noValidate onSubmit={f.handleSubmit(async (v) => {
        setErr(null);
        try {
          await api.post('/auth/register', v);
          toast.push({ kind: 'success', title: 'Pendaftaran berhasil', lines: ['Silakan masuk dengan surel dan kata sandi Bapak/Ibu.'] });
          nav('/masuk');
        } catch (x) { setErr(errorMessage(x)); }
      })}>
        <FormError message={err} />
        {step === 1 && (
          <>
            <Field label="Nama lengkap" required error={e.fullName?.message} hint="Sebagaimana tertera pada surat tugas.">{(p) => <Input {...p} autoComplete="name" {...f.register('fullName')} />}</Field>
            <Field label="Surel" required error={e.email?.message}>{(p) => <Input {...p} type="email" autoComplete="email" {...f.register('email')} />}</Field>
            <Field label="Kata sandi" required error={e.password?.message} hint="Minimal 8 karakter.">{(p) => <Input {...p} type="password" autoComplete="new-password" {...f.register('password')} />}</Field>
            <Button className="w-full" onClick={() => void next()} icon={<ArrowRight size={16} />}>Lanjut: pilih institusi</Button>
          </>
        )}
        {step === 2 && (
          <>
            <Field label="Institusi" required error={e.institutionId?.message} hint={insts.isError ? 'Daftar institusi tidak dapat dimuat. Muat ulang halaman.' : undefined}>
              {(p) => (
                <Select {...p} {...f.register('institutionId', { onChange: () => f.setValue('programId', '') })}>
                  <option value="">{insts.isLoading ? 'Memuat daftar institusi…' : 'Pilih institusi'}</option>
                  {insts.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Program studi" required error={e.programId?.message}>
              {(p) => (
                <Select {...p} disabled={!inst} {...f.register('programId')}>
                  <option value="">{!inst ? 'Pilih institusi terlebih dahulu' : progs.isLoading ? 'Memuat…' : 'Pilih program studi'}</option>
                  {progs.data?.map((x) => <option key={x.id} value={x.id}>{x.level} — {x.name}</option>)}
                </Select>
              )}
            </Field>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)} icon={<ArrowLeft size={16} />}>Kembali</Button>
              <Button type="submit" className="flex-1" loading={f.formState.isSubmitting}>Daftarkan akun</Button>
            </div>
          </>
        )}
      </form>
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
