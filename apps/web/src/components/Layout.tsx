import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Bell, ChevronDown, FilePlus2, House, Landmark, LogOut, Menu, Search, UserCheck, X } from 'lucide-react';
import { ROLE_HOME, type AppRole } from '@akreditasi/shared';
import { useAuth } from '../auth/AuthContext';
import { notifications, useEventStream, useNotifications } from '../api/sse';
import { ROLE_NAME, fmtDateTime } from '../lib/labels';
import { useTaskQueue } from '../features/common/useTasks';
import { usePendingRegistrationCount } from '../features/sekretariat/uppsRegistrations';
import { cx } from './ui';

type Icon = typeof Bell;
interface NavLeaf { to: string; label: string; icon: Icon; badge?: 'tasks' | 'registrations' }
interface NavItem extends Partial<NavLeaf> { label: string; icon: Icon; children?: NavLeaf[] }
interface NavGroup { label: string; items: NavItem[] }

export const MONITOR_ROLES: AppRole[] = ['kea', 'majelis', 'sek_adm'];

function navFor(role: AppRole): NavGroup[] {
  const groups: NavGroup[] = [{ label: 'Utama', items: [{ to: ROLE_HOME[role], label: 'Beranda', icon: House, badge: 'tasks' }] }];
  if (role === 'upps') groups.push({ label: 'Akreditasi', items: [{ to: '/upps/baru', label: 'Ajukan akreditasi', icon: FilePlus2 }] });
  if (role === 'sek_adm') groups.push({ label: 'Akun', items: [{ to: '/sekretariat/administrasi/akun-upps', label: 'Verifikasi akun UPPS', icon: UserCheck, badge: 'registrations' }] });
  if (MONITOR_ROLES.includes(role)) groups.push({ label: 'Pemantauan', items: [{ to: '/pemantauan', label: 'Pemantauan', icon: Activity }] });
  return groups;
}

export function BrandMark({ light }: { light?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-3', light ? 'text-white' : 'text-ink')}>
      <span className={cx('grid h-9 w-9 place-items-center rounded-lg', light ? 'bg-white/15 text-white' : 'bg-navy-900 text-white')}><Landmark size={18} aria-hidden /></span>
      <span className="leading-tight"><span className="block text-[15.5px] font-semibold">Sistem Akreditasi</span><span className={cx('block text-[12px]', light ? 'text-white/70' : 'text-faint')}>LAM Teknik</span></span>
    </span>
  );
}

function NotificationBell() {
  const list = useNotifications();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const unread = list.filter((n) => n.unread).length;
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={unread ? `Pemberitahuan, ${unread} belum dibaca` : 'Pemberitahuan'} aria-expanded={open}
        onClick={() => { setOpen((o) => !o); if (!open) setTimeout(() => notifications.markAllRead(), 1500); }}
        className="relative grid h-10 w-10 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink">
        <Bell size={19} />
        {unread > 0 && <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[11px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><p className="font-semibold">Pemberitahuan</p>{list.length > 0 && <button type="button" onClick={() => notifications.clear()} className="min-h-[32px] text-sm text-navy-700 hover:underline">Bersihkan</button>}</div>
          {list.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">Belum ada pemberitahuan baru.</p> : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {list.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => { setOpen(false); if (n.submissionId) nav(`/pengajuan/${n.submissionId}`); }} className="flex w-full gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                    <span className={cx('mt-2 h-2 w-2 shrink-0 rounded-full', n.tone === 'chain' ? 'bg-chain' : n.tone === 'warn' ? 'bg-wait' : 'bg-slate-400')} />
                    <span className="min-w-0"><span className="block text-sm font-medium text-ink">{n.title}</span>{n.detail && <span className="block text-sm text-muted">{n.detail}</span>}<span className="block text-xs text-faint">{fmtDateTime(n.at)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!user) return null;
  const initials = user.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-slate-100">
        <span className="hidden min-w-0 text-right sm:block"><span className="block max-w-[14rem] truncate text-sm font-medium leading-tight text-ink">{user.fullName}</span><span className="block text-xs leading-tight text-faint">{ROLE_NAME[user.role]}</span></span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-700 text-sm font-semibold text-white" aria-hidden>{initials}</span>
        <ChevronDown size={14} className="text-faint" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white py-1 shadow-pop">
          <div className="border-b border-slate-100 px-4 py-3"><p className="truncate font-semibold">{user.fullName}</p><p className="truncate text-sm text-muted">{ROLE_NAME[user.role]}</p>{user.institutionName && <p className="truncate text-xs text-faint">{user.institutionName}</p>}<p className="truncate text-xs text-faint">{user.email}</p></div>
          <button type="button" role="menuitem" onClick={() => void signOut()} className="flex min-h-[40px] w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50"><LogOut size={16} aria-hidden />Keluar</button>
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const tasks = useTaskQueue();
  const pendingRegs = usePendingRegistrationCount(user?.role === 'sek_adm');
  if (!user) return null;
  const count = (b?: 'tasks' | 'registrations') => (b === 'tasks' ? tasks.counts.action : b === 'registrations' ? pendingRegs : 0);
  const items = navFor(user.role).flatMap((g) => g.items.flatMap((it) => (it.children ? it.children : [it as NavLeaf])));
  const initials = user.fullName.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <>
      <nav aria-label="Menu utama" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map((n) => {
            const c = count(n.badge);
            return (
              <li key={n.to}>
                <NavLink to={n.to} end onClick={onNavigate}
                  className={({ isActive }) => cx('flex h-[42px] items-center gap-3 rounded-[10px] px-3 text-[14.5px] transition-colors', isActive ? 'bg-navy-50 font-semibold text-navy-700' : 'font-medium text-muted hover:bg-slate-100 hover:text-ink')}>
                  <n.icon size={18} aria-hidden className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  {c > 0 && <span aria-label={`${c} ${n.badge === 'registrations' ? 'menunggu verifikasi' : 'perlu tindakan'}`} className="rounded-md bg-navy-700 px-1.5 text-[12px] font-semibold text-white">{c}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex items-center gap-3 border-t border-line px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-100 text-[13px] font-semibold text-navy-800" aria-hidden>{initials}</span>
        <div className="min-w-0 flex-1 leading-tight"><div className="truncate text-[14px] font-semibold">{user.fullName}</div><div className="truncate text-[12.5px] text-faint">{ROLE_NAME[user.role]}{user.institutionName ? ` · ${user.institutionName}` : ''}</div></div>
        <button type="button" onClick={() => void signOut()} title="Keluar" aria-label="Keluar" className="grid h-9 w-9 place-items-center rounded-lg text-faint hover:bg-slate-100 hover:text-ink"><LogOut size={18} /></button>
      </div>
    </>
  );
}

export function Layout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const loc = useLocation();
  useEventStream(!!user);
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  if (!user) return null;

  const search = (e: FormEvent) => { e.preventDefault(); nav(`${ROLE_HOME[user.role]}?q=${encodeURIComponent(q.trim())}`); };
  const brand = <div className="flex h-16 shrink-0 items-center px-5"><BrandMark /></div>;
  return (
    <div className="min-h-screen lg:pl-[248px]">
      <aside data-shell className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-white lg:flex">
        {brand}
        <Sidebar />
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside data-shell className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-white shadow-pop">
            <div className="flex h-16 shrink-0 items-center justify-between px-5"><BrandMark /><button type="button" aria-label="Tutup menu" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-lg text-faint hover:bg-slate-100"><X size={19} /></button></div>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <header data-shell className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-8">
        <button type="button" aria-label="Buka menu" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-slate-100 lg:hidden"><Menu size={21} /></button>
        <div className="flex-1" />
        <form onSubmit={search} role="search" className="hidden md:block">
          <label className="relative block w-72"><span className="sr-only">Cari pengajuan</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari pengajuan" className="input !min-h-[40px] !border !border-line !bg-surface pl-9" />
          </label>
        </form>
        <NotificationBell />
        <div className="lg:hidden"><UserMenu /></div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-[1180px] px-4 pb-24 pt-8 sm:px-8"><Outlet /></main>
    </div>
  );
}
