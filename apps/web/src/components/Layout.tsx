import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, ClipboardCheck, ClipboardList, FilePlus2, FolderOpen, Gavel, LayoutDashboard, ListChecks, LogOut, Menu, Receipt, Search, ShieldCheck, UserCheck, Users, X } from 'lucide-react';
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

const DASH_LABEL: Record<AppRole, string> = {
  upps: 'Pengajuan Saya', sek_adm: 'Antrean Administrasi', sek_keu: 'Tagihan dan Pembayaran', kea: 'Antrean KEA', asesor: 'Penugasan Saya', majelis: 'Penetapan Peringkat',
};
const DASH_ICON: Record<AppRole, Icon> = { upps: FolderOpen, sek_adm: ClipboardCheck, sek_keu: Receipt, kea: ListChecks, asesor: ClipboardList, majelis: Gavel };

function navFor(role: AppRole): NavGroup[] {
  const groups: NavGroup[] = [{ label: 'Utama', items: [{ to: ROLE_HOME[role], label: DASH_LABEL[role], icon: role === 'upps' ? LayoutDashboard : DASH_ICON[role], badge: 'tasks' }] }];
  if (role === 'upps') groups.push({ label: 'Akreditasi', items: [{ label: 'Pengajuan', icon: FolderOpen, children: [{ to: '/upps/baru', label: 'Pengajuan Baru', icon: FilePlus2 }] }] });
  if (role === 'sek_adm') groups.push({ label: 'Akun', items: [{ label: 'Akun UPPS', icon: Users, children: [{ to: '/sekretariat/administrasi/akun-upps', label: 'Verifikasi Akun UPPS', icon: UserCheck, badge: 'registrations' }] }] });
  return groups;
}

export function BrandMark({ light }: { light?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2 text-[17px] font-medium', light ? 'text-white' : 'text-navy-900')}>
      <span className={cx('grid h-8 w-8 place-items-center rounded', light ? 'bg-white/15' : 'bg-navy-700 text-white')}><ShieldCheck size={18} aria-hidden /></span>
      Sistem Akreditasi
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
        className="relative grid h-10 w-10 place-items-center rounded text-slate-600 hover:bg-slate-100 hover:text-ink">
        <Bell size={19} />
        {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-[16px] place-items-center rounded bg-bad px-1 text-[10px] font-medium text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-md border border-line bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5"><p className="font-medium">Pemberitahuan</p>{list.length > 0 && <button type="button" onClick={() => notifications.clear()} className="min-h-[32px] text-sm text-navy-700 hover:underline">Bersihkan</button>}</div>
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
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} className="flex min-h-[40px] items-center gap-2.5 rounded px-1.5 py-1 hover:bg-slate-100">
        <span className="hidden min-w-0 text-right sm:block"><span className="block max-w-[14rem] truncate text-sm font-medium leading-tight text-ink">{user.fullName}</span><span className="block text-xs leading-tight text-faint">{ROLE_NAME[user.role]}</span></span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-700 text-sm font-medium text-white" aria-hidden>{initials}</span>
        <ChevronDown size={14} className="text-faint" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-1 w-64 rounded-md border border-line bg-white py-1 shadow-lg">
          <div className="border-b border-line px-4 py-2.5"><p className="truncate font-medium">{user.fullName}</p><p className="truncate text-sm text-muted">{ROLE_NAME[user.role]}</p>{user.institutionName && <p className="truncate text-xs text-faint">{user.institutionName}</p>}<p className="truncate text-xs text-faint">{user.email}</p></div>
          <button type="button" role="menuitem" onClick={() => void signOut()} className="flex min-h-[40px] w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50"><LogOut size={16} aria-hidden />Keluar</button>
        </div>
      )}
    </div>
  );
}

function Badge2({ n, label }: { n: number; label: string }) {
  if (n <= 0) return null;
  return <span aria-label={label} className="grid h-5 min-w-[20px] place-items-center rounded bg-navy-700 px-1.5 text-xs font-medium text-white">{n}</span>;
}

function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { user } = useAuth();
  const loc = useLocation();
  const tasks = useTaskQueue();
  const pendingRegs = usePendingRegistrationCount(user?.role === 'sek_adm');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  if (!user) return null;
  const count = (b?: 'tasks' | 'registrations') => (b === 'tasks' ? tasks.counts.action : b === 'registrations' ? pendingRegs : 0);
  const badgeLabel = (b?: 'tasks' | 'registrations') => (b === 'registrations' ? 'pendaftaran menunggu verifikasi' : 'perlu tindakan');
  const leaf = (n: NavLeaf, child?: boolean) => (
    <NavLink key={n.to} to={n.to} end title={collapsed ? n.label : undefined} onClick={onNavigate}
      className={({ isActive }) => cx('flex min-h-[40px] items-center gap-3 rounded px-3 py-2 text-sm transition-colors', collapsed && 'justify-center px-0', child && !collapsed && 'pl-9',
        isActive ? 'bg-navy-50 font-medium text-navy-700 shadow-[inset_3px_0_0_0_#1E4D8C]' : 'text-slate-700 hover:bg-slate-100 hover:text-ink')}>
      <n.icon size={17} aria-hidden className="shrink-0" />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{n.label}</span>}
      {!collapsed && <Badge2 n={count(n.badge)} label={`${count(n.badge)} ${badgeLabel(n.badge)}`} />}
    </NavLink>
  );
  return (
    <nav aria-label="Menu utama" className="flex-1 overflow-y-auto px-2.5 py-3">
      {navFor(user.role).map((g) => (
        <div key={g.label} className="mb-3">
          {!collapsed && <p className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">{g.label}</p>}
          {collapsed && <hr className="mx-2 mb-2 border-line" />}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              if (!it.children) return <li key={it.label}>{leaf(it as NavLeaf)}</li>;
              const open = !closed[it.label];
              const childActive = it.children.some((c) => loc.pathname.startsWith(c.to));
              const sum = it.children.reduce((a, c) => a + count(c.badge), 0);
              if (collapsed) return <li key={it.label}><ul className="space-y-0.5">{it.children.map((c) => <li key={c.to}>{leaf(c)}</li>)}</ul></li>;
              return (
                <li key={it.label}>
                  <button type="button" aria-expanded={open} onClick={() => setClosed((x) => ({ ...x, [it.label]: open }))}
                    className={cx('flex min-h-[40px] w-full items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-slate-100', childActive ? 'font-medium text-navy-700' : 'text-slate-700')}>
                    <it.icon size={17} aria-hidden className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {!open && <Badge2 n={sum} label={`${sum} perlu tindakan`} />}
                    <ChevronDown size={14} aria-hidden className={cx('shrink-0 text-faint transition-transform', open && 'rotate-180')} />
                  </button>
                  {open && <ul className="mt-0.5 space-y-0.5">{it.children.map((c) => <li key={c.to}>{leaf(c, true)}</li>)}</ul>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const COLLAPSE_KEY = 'sidebar-collapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };

export function Layout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const loc = useLocation();
  useEventStream(!!user);
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  if (!user) return null;

  const toggleCollapse = () => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* abaikan */ } return !c; });
  const search = (e: FormEvent) => { e.preventDefault(); nav(`${ROLE_HOME[user.role]}?q=${encodeURIComponent(q.trim())}`); };
  const brand = (
    <div className="flex h-[60px] shrink-0 items-center border-b border-line px-4">{collapsed ? <span className="mx-auto grid h-8 w-8 place-items-center rounded bg-navy-700 text-white" aria-label="Sistem Akreditasi"><ShieldCheck size={18} aria-hidden /></span> : <BrandMark />}</div>
  );
  return (
    <div className={cx('min-h-screen transition-[padding] duration-150', collapsed ? 'lg:pl-[68px]' : 'lg:pl-[250px]')}>
      <aside data-shell className={cx('fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-white transition-[width] duration-150 lg:flex', collapsed ? 'w-[68px]' : 'w-[250px]')}>
        {brand}
        <Sidebar collapsed={collapsed} />
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside data-shell className="absolute inset-y-0 left-0 flex w-[270px] max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-line px-4"><BrandMark /><button type="button" aria-label="Tutup menu" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded text-slate-600 hover:bg-slate-100"><X size={19} /></button></div>
            <Sidebar collapsed={false} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <header data-shell className="sticky top-0 z-20 flex h-[60px] items-center gap-2 border-b border-line bg-white px-3 shadow-header sm:px-5">
        <button type="button" aria-label="Buka menu" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded text-slate-700 hover:bg-slate-100 lg:hidden"><Menu size={21} /></button>
        <button type="button" aria-label={collapsed ? 'Perluas menu samping' : 'Ciutkan menu samping'} aria-pressed={collapsed} onClick={toggleCollapse} className="hidden h-10 w-10 place-items-center rounded text-slate-700 hover:bg-slate-100 lg:grid"><Menu size={21} /></button>
        <form onSubmit={search} role="search" className="hidden min-w-0 flex-1 md:block">
          <label className="relative block max-w-sm"><span className="sr-only">Cari pengajuan</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari program studi atau institusi" className="input pl-9" />
          </label>
        </form>
        <div className="flex-1 md:hidden" />
        <NotificationBell />
        <UserMenu />
      </header>
      <div className="flex min-h-[calc(100vh-60px)] flex-col">
        <main className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 px-3 py-4 sm:px-5 sm:py-5"><Outlet /></main>
        <footer data-shell className="border-t border-line bg-white px-5 py-3 text-center text-sm text-muted">Hak cipta © 2026 Sistem Akreditasi. Seluruh hak dilindungi.</footer>
      </div>
    </div>
  );
}
