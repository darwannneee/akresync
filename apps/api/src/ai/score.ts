import { INSTRUMENT_DOKTOR_2025, computeTotal, criterionSummary, maxTotal, scoredItemCount, type AiResult, type AiTotals, type InstrumentScores } from '@akreditasi/shared';

/** Total & subtotal per kriteria dari saran AI (butir tanpa saran tidak dihitung). Bukan nilai resmi. */
export function aiTotals(result: AiResult): AiTotals {
  const scores: Record<string, Record<string, number>> = {};
  let answered = 0;
  for (const it of result.items) {
    if (it.suggestedScore === null) continue;
    (scores[it.criterion] ??= {})[it.butirId] = it.suggestedScore;
    answered++;
  }
  const inst = INSTRUMENT_DOKTOR_2025;
  return {
    total: computeTotal(scores as InstrumentScores),
    max: maxTotal(inst),
    answered,
    itemCount: scoredItemCount(inst),
    perCriterion: inst.criteria.filter((c) => c.scored).map((c) => ({ code: c.code, ...criterionSummary(scores as InstrumentScores, c.code) })),
  };
}
