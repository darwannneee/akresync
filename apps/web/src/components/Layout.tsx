import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ROLE_HOME, ROLE_LABEL, type AppRole } from '@akreditasi/shared';
import { useAuth } from '../auth/AuthContext';
import { useEventStream } from '../api/sse';
import { Button, cx } from './ui';

const NAV: Record<AppRole, { to: string; label: string }[]> = {
  upps: [{ to: ROLE_HOME.upps, label: 'Pengajuan Saya' }, { to: '/upps/baru', label: 'Pengajuan Baru' }],
  sek_adm: [{ to: ROLE_HOME.sek_adm, label: 'Antrean Administrasi' }],
  sek_keu: [{ to: ROLE_HOME.sek_keu, label: 'Tagihan & Pembayaran' }],
  kea: [{ to: ROLE_HOME.kea, label: 'Antrean KEA' }],
  asesor: [{ to: ROLE_HOME.asesor, label: 'Penugasan Saya' }],
  majelis: [{ to: ROLE_HOME.majelis, label: 'Penetapan' }],
};

export function Layout() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  useEventStream(!!user);
  if (!user) return null;
  const nav = (
    <nav aria-label="Menu utama" className="flex flex-col gap-1 p-3">
      {NAV[user.role].map((n) => (
        <NavLink key={n.to} to={n.to} end onClick={() => setOpen(false)}
          className={({ isActive }) => cx('rounded-md px-3 py-2 text-sm', isActive ? 'bg-white/15 font-semibold text-white' : 'text-navy-100 hover:bg-white/10')}>
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <header className="sticky top-0 z-30 flex items-center justify-between bg-navy-900 px-4 py-3 text-white lg:hidden">
        <span className="font-semibold">Sistem Akreditasi</span>
        <button aria-label="Buka menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded p-2 hover:bg-white/10">☰</button>
      </header>
      <aside className={cx('bg-navy-900 text-white lg:sticky lg:top-0 lg:block lg:h-screen', open ? 'block' : 'hidden')}>
        <div className="hidden border-b border-white/10 px-4 py-5 lg:block">
          <div className="text-lg font-semibold">Sistem Akreditasi</div>
          <div className="mt-1 h-0.5 w-8 bg-accent" />
        </div>
        <div className="border-b border-white/10 px-4 py-3 text-sm">
          <div className="truncate font-medium">{user.fullName}</div>
          <div className="text-xs text-navy-100">{ROLE_LABEL[user.role]}</div>
        </div>
        {nav}
        <div className="p-3">
          <Button variant="ghost" className="w-full !text-white hover:!bg-white/10" onClick={() => void signOut()}>Keluar</Button>
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-6"><Outlet /></main>
    </div>
  );
}
