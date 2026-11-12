import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, ClipboardCheck, ClipboardList, FilePlus2, FolderOpen, Gavel, ListChecks, LogOut, Menu, Receipt, Search, X, ChevronRight } from 'lucide-react';
import { ROLE_HOME, type AppRole } from '@akreditasi/shared';
import { useAuth } from '../auth/AuthContext';
import { notifications, useEventStream, useNotifications } from '../api/sse';
import type { SubmissionDetail } from '../api/types';
import { ROLE_NAME, fmtDateTime, shortId } from '../lib/labels';
import { useTaskQueue } from '../features/common/useTasks';
import { cx } from './ui';

interface NavItem { to: string; label: string; icon: typeof Bell; badge?: boolean }
const NAV: Record<AppRole, NavItem[]> = {
  upps: [{ to: ROLE_HOME.upps, label: 'Pengajuan Saya', icon: FolderOpen, badge: true }, { to: '/upps/baru', label: 'Pengajuan Baru', icon: FilePlus2 }],
  sek_adm: [{ to: ROLE_HOME.sek_adm, label: 'Antrean Administrasi', icon: ClipboardCheck, badge: true }],
  sek_keu: [{ to: ROLE_HOME.sek_keu, label: 'Tagihan dan Pembayaran', icon: Receipt, badge: true }],
  kea: [{ to: ROLE_HOME.kea, label: 'Antrean KEA', icon: ListChecks, badge: true }],
  asesor: [{ to: ROLE_HOME.asesor, label: 'Penugasan Saya', icon: ClipboardList, badge: true }],
  majelis: [{ to: ROLE_HOME.majelis, label: 'Penetapan Peringkat', icon: Gavel, badge: true }],
};

export function BrandMark({ light }: { light?: boolean }) {
  return (
    <div>
      <div className={cx('font-display text-lg font-bold leading-tight tracking-tight', light ? 'text-white' : 'text-navy-900')}>Sistem Akreditasi</div>
      <div className="mt-1.5 h-[2px] w-9 bg-accent" />
      <div className={cx('mt-1.5 text-xs', light ? 'text-navy-200' : 'text-faint')}>Akreditasi Program Studi</div>
    </div>
  );
}

function Breadcrumb() {
  const { user } = useAuth();
  const loc = useLocation();
  const params = useParams();
  const qc = useQueryClient();
  if (!user) return null;
  const home = ROLE_HOME[user.role];
  const crumbs: { to?: string; label: string }[] = [{ to: home, label: 'Beranda' }];
  const p = loc.pathname;
  const sid = params.id;
  const sub = sid ? qc.getQueryData<SubmissionDetail>(['submission', sid]) : undefined;
  if (p === '/upps/baru') crumbs.push({ label: 'Pengajuan Baru' });
  else if (p.startsWith('/pengajuan/')) crumbs.push({ to: home, label: 'Pengajuan' }, { label: sub?.programName ?? `Pengajuan ${shortId(sid ?? '')}` });
  else if (p.includes('/penilaian/')) crumbs.push({ to: home, label: 'Penugasan' }, { to: `/pengajuan/${sid}`, label: sub?.programName ?? `Pengajuan ${shortId(sid ?? '')}` }, { label: `Penilaian ${params.phase === 'AL' ? 'Asesmen Lapangan' : 'Asesmen Kecukupan'}` });
  else crumbs.push({ label: NAV[user.role][0]!.label });
  return (
    <nav aria-label="Jejak halaman" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm text-muted">
        {crumbs.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight size={14} className="shrink-0 text-slate-400" aria-hidden />}
            {c.to && i < crumbs.length - 1 ? <Link to={c.to} className="truncate rounded hover:text-navy-700 hover:underline">{c.label}</Link> : <span className={cx('truncate', i === crumbs.length - 1 && 'font-semibold text-ink')} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
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
        className="relative grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink">
        <Bell size={20} />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3"><p className="font-semibold">Pemberitahuan</p>{list.length > 0 && <button type="button" onClick={() => notifications.clear()} className="text-sm text-navy-700 hover:underline">Bersihkan</button>}</div>
          {list.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted">Belum ada pemberitahuan baru. Perubahan status pengajuan akan tampil di sini.</p> : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {list.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => { setOpen(false); if (n.submissionId) nav(`/pengajuan/${n.submissionId}`); }} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-navy-50">
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

export function Layout() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const loc = useLocation();
  const tasks = useTaskQueue();
  useEventStream(!!user);
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  if (!user) return null;

  const search = (e: FormEvent) => { e.preventDefault(); nav(`${ROLE_HOME[user.role]}?q=${encodeURIComponent(q.trim())}`); };
  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 py-5"><BrandMark light /></div>
      <nav aria-label="Menu utama" className="flex-1 space-y-1 overflow-y-auto p-3">
        <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-navy-200/70">Menu</p>
        {NAV[user.role].map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) => cx('group flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors', isActive ? 'bg-white/15 font-semibold text-white ring-1 ring-white/10' : 'text-navy-100 hover:bg-white/10 hover:text-white')}>
            <n.icon size={18} aria-hidden className="shrink-0" />
            <span className="flex-1">{n.label}</span>
            {n.badge && tasks.counts.action > 0 && <span aria-label={`${tasks.counts.action} perlu tindakan`} className="grid h-6 min-w-[24px] place-items-center rounded-full bg-accent px-2 text-xs font-bold text-navy-950">{tasks.counts.action}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 font-display text-sm font-bold text-white" aria-hidden>{user.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
          <div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{user.fullName}</div><div className="truncate text-xs text-navy-200">{ROLE_NAME[user.role]}</div>{user.institutionName && <div className="truncate text-xs text-navy-200/80">{user.institutionName}</div>}</div>
        </div>
        <button type="button" onClick={() => void signOut()} className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-white/20 text-sm font-medium text-white hover:bg-white/10"><LogOut size={16} aria-hidden />Keluar</button>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen lg:pl-64">
      <aside data-shell className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-navy-950 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <aside data-shell className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-navy-950 shadow-2xl">
            <button type="button" aria-label="Tutup menu" onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-lg p-2 text-white hover:bg-white/10"><X size={20} /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <header data-shell className="sticky top-0 z-20 flex min-h-[64px] items-center gap-3 border-b border-line bg-white px-4 sm:px-6">
        <button type="button" aria-label="Buka menu" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-slate-100 lg:hidden"><Menu size={22} /></button>
        <div className="min-w-0 flex-1"><Breadcrumb /></div>
        <form onSubmit={search} role="search" className="hidden md:block">
          <label className="relative block"><span className="sr-only">Cari pengajuan</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari program studi atau institusi" className="input w-72 pl-9" />
          </label>
        </form>
        <NotificationBell />
      </header>
      <main className="mx-auto min-w-0 max-w-[1360px] px-4 py-6 sm:px-6 lg:px-8"><Outlet /></main>
    </div>
  );
}
