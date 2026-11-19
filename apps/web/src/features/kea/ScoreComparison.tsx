import { INSTRUMENT_DOKTOR_2025 as INST, criterionSummary, type InstrumentScores } from '@akreditasi/shared';
import type { AssessmentView } from '../../api/types';
import { StatusDot, cx } from '../../components/ui';
import { fmtNumber } from '../../lib/labels';

/** Selisih skor kriteria dianggap menonjol bila >= 15% dari skor maksimum kriteria; selisih butir bila >= 2 tingkat skor. */
export const CRITERION_DIFF_RATIO = 0.15;
export const ITEM_DIFF_LEVELS = 2;

const CRITERIA = INST.criteria.filter((c) => c.scored);
const itemNo = (i: { no: number; sub: number | null }) => (i.sub ? `${i.no}.${i.sub}` : String(i.no));

export function compareScores(a: InstrumentScores, b: InstrumentScores) {
  return CRITERIA.map((c) => {
    const sa = criterionSummary(a, c.code);
    const sb = criterionSummary(b, c.code);
    const diff = Math.round((sa.subtotal - sb.subtotal) * 100) / 100;
    const items = INST.items.filter((i) => i.criterion === c.code).map((i) => {
      const va = a[c.code]?.[i.id];
      const vb = b[c.code]?.[i.id];
      const d = typeof va === 'number' && typeof vb === 'number' ? va - vb : null;
      return { id: i.id, no: itemNo(i), element: i.element, va, vb, d, flag: d !== null && Math.abs(d) >= ITEM_DIFF_LEVELS };
    });
    return { code: c.code, title: c.title, max: sa.max, a: sa.subtotal, b: sb.subtotal, diff, flag: sa.max > 0 && Math.abs(diff) >= CRITERION_DIFF_RATIO * sa.max, items };
  });
}

/** Tabel butir dua asesor (opsional kolom saran AI); `onlyFlagged` hanya menampilkan selisih >= ITEM_DIFF_LEVELS. */
export function ItemDiffTable({ first, second, ai, onlyFlagged }: { first: AssessmentView; second: AssessmentView; ai?: (butirId: string) => number | null | undefined; onlyFlagged: boolean }) {
  const rows = compareScores(first.scores ?? {}, second.scores ?? {}).flatMap((r) => r.items).filter((i) => !onlyFlagged || i.flag);
  const short = (a: AssessmentView, f: string) => a.assessorName ?? f;
  if (!rows.length) return <p className="p-[22px] text-[14.5px] text-faint">{onlyFlagged ? `Tidak ada butir dengan selisih ${ITEM_DIFF_LEVELS} tingkat atau lebih.` : 'Skor rinci belum tersedia.'}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14.5px]">
        <caption className="sr-only">Skor butir kedua asesor{ai ? ' dan saran AI' : ''}</caption>
        <thead><tr className="border-b border-line text-left text-[13px] text-faint">
          <th scope="col" className="px-[22px] py-3 font-medium">Butir</th>
          <th scope="col" className="px-3 py-3 text-center font-medium">{short(first, 'Asesor 1')}</th>
          <th scope="col" className="px-3 py-3 text-center font-medium">{short(second, 'Asesor 2')}</th>
          {ai && <th scope="col" className="px-3 py-3 pr-[22px] text-center font-medium">AI</th>}
        </tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((i) => (
            <tr key={i.id}>
              <td className="px-[22px] py-3.5"><span className="text-faint tabular-nums">{i.no}</span> {i.element}</td>
              <td className={cx('px-3 text-center font-semibold tabular-nums', i.flag && 'text-wait')}>{i.va ?? '—'}</td>
              <td className={cx('px-3 text-center font-semibold tabular-nums', i.flag && 'text-wait')}>{i.vb ?? '—'}</td>
              {ai && <td className="px-3 pr-[22px] text-center tabular-nums text-faint">{ai(i.id) ?? '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Perbandingan skor dua asesor per kriteria dan per butir; selisih menonjol ditandai. */
export function ScoreComparison({ first, second }: { first: AssessmentView; second: AssessmentView }) {
  if (!first.scores || !second.scores) return <p className="text-sm text-muted">Skor rinci belum tersedia untuk dibandingkan.</p>;
  const rows = compareScores(first.scores, second.scores);
  const nA = first.assessorName ?? 'Asesor 1';
  const nB = second.assessorName ?? 'Asesor 2';
  const flagged = rows.filter((r) => r.flag || r.items.some((i) => i.flag)).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Selisih ditandai bila skor kriteria berbeda sedikitnya {Math.round(CRITERION_DIFF_RATIO * 100)}% dari skor maksimum kriteria, atau skor butir berbeda sedikitnya {ITEM_DIFF_LEVELS} tingkat. {flagged ? `${flagged} dari ${rows.length} kriteria memuat selisih menonjol.` : 'Tidak ada selisih menonjol.'}</p>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Perbandingan skor kedua asesor per kriteria</caption>
          <thead className="border-b border-line text-left text-[13px] text-faint">
            <tr><th scope="col" className="px-3 py-2.5 font-medium">Kriteria</th><th scope="col" className="px-3 py-2.5 text-right font-medium">{nA}</th><th scope="col" className="px-3 py-2.5 text-right font-medium">{nB}</th><th scope="col" className="px-3 py-2.5 text-right font-medium">Selisih</th></tr>
          </thead>
          <tbody className="divide-y divide-line bg-white">
            {rows.map((r) => (
              <tr key={r.code} className={r.flag ? 'bg-wait-bg/50' : undefined}>
                <td className="px-3 py-2.5 align-top">
                  <details>
                    <summary className="cursor-pointer font-medium text-ink">Kriteria {r.code.slice(1)}. {r.title}{(r.flag || r.items.some((i) => i.flag)) && <StatusDot tone="warn" className="ml-2 align-middle">Selisih menonjol</StatusDot>}</summary>
                    <ul className="mt-2 space-y-1 text-sm">
                      {r.items.map((i) => (
                        <li key={i.id} className={`grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3 rounded px-1.5 py-1 ${i.flag ? 'bg-wait-bg font-medium text-wait' : 'text-slate-700'}`}>
                          <span className="min-w-0">Butir {i.no}. {i.element}</span>
                          <span className="tabular-nums" title={nA}>{i.va ?? '—'}</span>
                          <span className="tabular-nums" title={nB}>{i.vb ?? '—'}</span>
                          <span className="tabular-nums">{i.d === null ? '—' : i.d > 0 ? `+${i.d}` : i.d}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
                <td className="px-3 py-2.5 text-right align-top tabular-nums">{fmtNumber(r.a)}</td>
                <td className="px-3 py-2.5 text-right align-top tabular-nums">{fmtNumber(r.b)}</td>
                <td className={`px-3 py-2.5 text-right align-top tabular-nums ${r.flag ? 'font-semibold text-wait' : ''}`}>{r.diff > 0 ? '+' : ''}{fmtNumber(r.diff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
