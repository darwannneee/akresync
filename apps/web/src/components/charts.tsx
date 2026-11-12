import { useEffect, useId, useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Table2, BarChart3 } from 'lucide-react';
import { fmtMonth, fmtNumber } from '../lib/labels';
import { cx } from './ui';

/**
 * Palet grafik (kategori, mode terang) tervalidasi dengan validate_palette.js, urutan slot mengikuti referensi:
 * biru #2a78d6, oranye #eb6834, aqua #1baf7a. Peringkat memakai satu rampa biru (ordinal), bukan warna kategori.
 */
export const SERIES = { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a' } as const;
export const RANK_COLORS: Record<string, string> = { UNGGUL: '#184f95', BAIK_SEKALI: '#3987e5', BAIK: '#86b6ef', TIDAK_TERAKREDITASI: '#64748b' };
const INK = '#475569';
const GRID = '#e2e8f0';

export interface TableData { columns: string[]; rows: (string | number)[][] }

/** Kartu grafik: judul, tombol "Lihat tabel", grafik berlabel aksesibilitas, tabel sr-only atau tabel terlihat. */
export function ChartCard({ title, description, ariaLabel, table, legend, children, className, empty }: {
  title: string; description?: string; ariaLabel: string; table: TableData; legend?: { label: string; color: string }[]; children: ReactNode; className?: string; empty?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <section className={cx('card flex flex-col', className)} aria-labelledby={`${id}-t`}>
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pt-5">
        <div className="min-w-0">
          <h2 id={`${id}-t`} className="text-base font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {!empty && (
          <button type="button" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}
            className="no-print inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
            {asTable ? <BarChart3 size={15} aria-hidden /> : <Table2 size={15} aria-hidden />}{asTable ? 'Lihat grafik' : 'Lihat tabel'}
          </button>
        )}
      </header>
      <div className="flex-1 px-5 pb-5 pt-3">
        {empty ?? (asTable ? (
          <div className="max-h-[320px] overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <caption className="sr-only">{ariaLabel}</caption>
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"><tr>{table.columns.map((c, i) => <th key={c} scope="col" className={cx('px-3 py-2', i > 0 && 'text-right')}>{c}</th>)}</tr></thead>
              <tbody>{table.rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{r.map((v, j) => j === 0 ? <th key={j} scope="row" className="px-3 py-2 text-left font-normal text-ink">{v}</th> : <td key={j} className="px-3 py-2 text-right tabular-nums">{typeof v === 'number' ? fmtNumber(v) : v}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : (
          <>
            {legend && legend.length >= 2 && (
              <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700" aria-label="Legenda">
                {legend.map((l) => <li key={l.label} className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />{l.label}</li>)}
              </ul>
            )}
            <div role="img" aria-label={ariaLabel}>{children}</div>
            <div className="sr-only"><table>
              <caption>{ariaLabel}</caption>
              <thead><tr>{table.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
              <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j}>{v}</td>)}</tr>)}</tbody>
            </table></div>
          </>
        ))}
      </div>
    </section>
  );
}

interface TipPayload { name?: string | number; value?: number | string; color?: string; payload?: Record<string, unknown> }
function Tip({ active, payload, label, unit }: { active?: boolean; payload?: TipPayload[]; label?: string | number; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-pop">
      {label !== undefined && label !== '' && <p className="mb-1 font-semibold text-ink">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-slate-700">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />{p.name}: <b className="tabular-nums text-ink">{fmtNumber(p.value as number, 0)}{unit ? ` ${unit}` : ''}</b>
        </p>
      ))}
    </div>
  );
}

function useWide(min = 640) {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia(`(min-width:${min}px)`).matches));
  useEffect(() => {
    const m = window.matchMedia(`(min-width:${min}px)`);
    const on = () => setW(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [min]);
  return w;
}

/** Batang horizontal satu seri (jumlah per kategori), label nilai langsung di ujung batang. */
export function HBars({ data, color = SERIES.blue, seriesName = 'Pengajuan', rowHeight = 36, labelWidth }: { data: { label: string; value: number }[]; color?: string; seriesName?: string; rowHeight?: number; labelWidth?: number }) {
  const wide = useWide();
  const lw = labelWidth ?? (wide ? 215 : 150);
  return (
    <ResponsiveContainer width="100%" height={data.length * rowHeight + 12}>
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 34, bottom: 2, left: 0 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" hide allowDecimals={false} domain={[0, (m: number) => Math.max(m, 1)]} />
        <YAxis type="category" dataKey="label" width={lw} tickLine={false} axisLine={false} tick={{ fill: INK, fontSize: 13 }} interval={0} />
        <Tooltip cursor={{ fill: '#f1f5f9' }} content={<Tip />} />
        <Bar dataKey="value" name={seriesName} fill={color} radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
          <LabelList dataKey="value" position="right" fill="#0f172a" fontSize={13} fontWeight={600} formatter={(v: number) => fmtNumber(v, 0)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Tren bulanan dua seri pada satu sumbu. */
export function TrendArea({ data, height = 260 }: { data: { month: string; submitted: number; decided: number }[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, label: fmtMonth(d.month) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="g-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SERIES.blue} stopOpacity={0.22} /><stop offset="100%" stopColor={SERIES.blue} stopOpacity={0.02} /></linearGradient>
          <linearGradient id="g-orange" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SERIES.orange} stopOpacity={0.2} /><stop offset="100%" stopColor={SERIES.orange} stopOpacity={0.02} /></linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: INK, fontSize: 12 }} interval="preserveStartEnd" minTickGap={18} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ fill: INK, fontSize: 12 }} tickFormatter={(v: number) => fmtNumber(v, 0)} />
        <Tooltip content={<Tip />} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
        <Area type="monotone" dataKey="submitted" name="Pengajuan masuk" stroke={SERIES.blue} strokeWidth={2} fill="url(#g-blue)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        <Area type="monotone" dataKey="decided" name="Keputusan terbit" stroke={SERIES.orange} strokeWidth={2} fill="url(#g-orange)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Donut + daftar nilai langsung (label, jumlah, persen). */
export function Donut({ data, centerLabel }: { data: { key: string; label: string; value: number; color: string }[]; centerLabel: string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
      <div className="relative h-[170px] w-[170px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={54} outerRadius={80} paddingAngle={total && data.filter((d) => d.value > 0).length > 1 ? 2 : 0} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.key} fill={d.color} />)}
            </Pie>
            <Tooltip content={<Tip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><div className="text-2xl font-semibold tabular-nums text-ink">{fmtNumber(total, 0)}</div><div className="text-xs text-muted">{centerLabel}</div></div></div>
      </div>
      <ul className="min-w-[10rem] flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2.5">
            <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 text-slate-700">{d.label}</span>
            <b className="tabular-nums text-ink">{fmtNumber(d.value, 0)}</b>
            <span className="w-12 text-right tabular-nums text-faint">{total ? `${fmtNumber((d.value / total) * 100, 0)}%` : '0%'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
