import { INSTRUMENT_DOKTOR_2025 as INST, criterionSummary, type InstrumentScores } from '@akreditasi/shared';
import type { AssessmentView } from '../../api/types';
import { Badge } from '../../components/ui';
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
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Perbandingan skor kedua asesor per kriteria</caption>
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr><th scope="col" className="px-3 py-2.5">Kriteria</th><th scope="col" className="px-3 py-2.5 text-right">{nA}</th><th scope="col" className="px-3 py-2.5 text-right">{nB}</th><th scope="col" className="px-3 py-2.5 text-right">Selisih</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((r) => (
              <tr key={r.code} className={r.flag ? 'bg-wait-bg/50' : undefined}>
                <td className="px-3 py-2.5 align-top">
                  <details>
                    <summary className="cursor-pointer font-medium text-ink">Kriteria {r.code.slice(1)}. {r.title}{(r.flag || r.items.some((i) => i.flag)) && <span className="ml-2 align-middle"><Badge tone="warn">Selisih menonjol</Badge></span>}</summary>
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
