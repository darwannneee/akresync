import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ROLE_HOME } from '@akreditasi/shared';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../api/client';
import { Button, Card, Field, FormError, Input, Select } from '../components/ui';
import { useInstitutions, usePrograms } from '../features/common/queries';
import { useToast } from '../components/Toast';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-surface px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-4 rounded-t-lg bg-navy-900 px-5 py-4 text-white">
          <div className="text-xl font-semibold">Sistem Akreditasi</div>
          <div className="mt-1 h-0.5 w-8 bg-accent" />
        </div>
        <Card title={title}>{children}</Card>
      </div>
    </div>
  );
}

const loginSchema = z.object({ email: z.string().email('Alamat surel tidak valid'), password: z.string().min(1, 'Kata sandi wajib diisi') });
export function LoginPage() {
  const { user, signIn } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const f = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return (
    <Shell title="Masuk">
      <form className="space-y-4" noValidate onSubmit={f.handleSubmit(async (v) => {
        setErr(null);
        try { const u = await signIn(v.email, v.password); nav(ROLE_HOME[u.role], { replace: true }); } catch (e) { setErr(errorMessage(e)); }
      })}>
        <FormError message={err} />
        <Field label="Surel" error={f.formState.errors.email?.message}>{(id) => <Input id={id} type="email" autoComplete="username" {...f.register('email')} />}</Field>
        <Field label="Kata sandi" error={f.formState.errors.password?.message}>{(id) => <Input id={id} type="password" autoComplete="current-password" {...f.register('password')} />}</Field>
        <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Masuk</Button>
        <p className="text-center text-sm text-slate-600">Perwakilan UPPS belum memiliki akun? <Link className="font-medium text-navy-700 underline" to="/daftar">Daftar</Link></p>
      </form>
    </Shell>
  );
}

const regSchema = z.object({
  fullName: z.string().min(3, 'Nama lengkap wajib diisi'),
  email: z.string().email('Alamat surel tidak valid'),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter'),
  institutionId: z.string().min(1, 'Pilih institusi'),
  programId: z.string().min(1, 'Pilih program studi'),
});
export function RegisterPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const f = useForm<z.infer<typeof regSchema>>({ resolver: zodResolver(regSchema), defaultValues: { institutionId: '', programId: '' } });
  const inst = f.watch('institutionId');
  const insts = useInstitutions();
  const progs = usePrograms(inst);
  const e = f.formState.errors;
  return (
    <Shell title="Registrasi Akun UPPS">
      <form className="space-y-4" noValidate onSubmit={f.handleSubmit(async (v) => {
        setErr(null);
        try {
          await api.post('/auth/register', v);
          toast.push({ kind: 'success', title: 'Registrasi berhasil', lines: ['Silakan masuk dengan akun Anda.'] });
          nav('/masuk');
        } catch (x) { setErr(errorMessage(x)); }
      })}>
        <FormError message={err} />
        <Field label="Nama lengkap" error={e.fullName?.message}>{(id) => <Input id={id} autoComplete="name" {...f.register('fullName')} />}</Field>
        <Field label="Surel" error={e.email?.message}>{(id) => <Input id={id} type="email" autoComplete="email" {...f.register('email')} />}</Field>
        <Field label="Kata sandi" error={e.password?.message}>{(id) => <Input id={id} type="password" autoComplete="new-password" {...f.register('password')} />}</Field>
        <Field label="Institusi" error={e.institutionId?.message} hint={insts.isError ? 'Daftar institusi tidak dapat dimuat.' : undefined}>
          {(id) => (
            <Select id={id} {...f.register('institutionId', { onChange: () => f.setValue('programId', '') })}>
              <option value="">{insts.isLoading ? 'Memuat…' : 'Pilih institusi'}</option>
              {insts.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Program studi" error={e.programId?.message}>
          {(id) => (
            <Select id={id} disabled={!inst} {...f.register('programId')}>
              <option value="">{!inst ? 'Pilih institusi terlebih dahulu' : progs.isLoading ? 'Memuat…' : 'Pilih program studi'}</option>
              {progs.data?.map((p) => <option key={p.id} value={p.id}>{p.level} — {p.name}</option>)}
            </Select>
          )}
        </Field>
        <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Daftar</Button>
        <p className="text-center text-sm"><Link className="text-navy-700 underline" to="/masuk">Kembali ke halaman masuk</Link></p>
      </form>
    </Shell>
  );
}

export function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p className="text-5xl font-semibold text-navy-900">404</p>
        <p className="mt-2 text-slate-600">Halaman yang Anda cari tidak ditemukan.</p>
        <Link to="/" className="mt-4 inline-block rounded-md bg-navy-900 px-4 py-2 text-sm text-white">Kembali ke beranda</Link>
      </div>
    </div>
  );
}
