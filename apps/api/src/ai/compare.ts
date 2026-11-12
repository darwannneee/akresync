import { INSTRUMENT_DOKTOR_2025, type AiComparison, type AiComparisonItem, type AiResult } from '@akreditasi/shared';

type Scores = Record<string, Record<string, number>> | null | undefined;

/** Bandingkan saran AI dengan skor asesor (per butir: sama / beda / tanpa saran / belum ada skor akhir). */
export function compareSuggestionToFinal(
  analysisId: string,
  phase: 'AK' | 'AL',
  assessor: { id: string; name: string | null },
  result: AiResult,
  scores: Scores,
  finalStatus: 'draft' | 'submitted' | null,
): AiComparison {
  const items: AiComparisonItem[] = result.items.map((it) => {
    const crit = INSTRUMENT_DOKTOR_2025.items.find((x) => x.id === it.butirId)?.criterion ?? it.criterion;
    const raw = scores?.[crit]?.[it.butirId];
    const final = typeof raw === 'number' ? raw : null;
    let kind: AiComparisonItem['kind'];
    if (it.suggestedScore === null) kind = 'no_suggestion';
    else if (final === null) kind = 'no_final';
    else kind = final === it.suggestedScore ? 'same' : 'different';
    return { butirId: it.butirId, suggested: it.suggestedScore, final, kind };
  });
  const count = (k: AiComparisonItem['kind']) => items.filter((i) => i.kind === k).length;
  return {
    analysisId,
    assessorId: assessor.id,
    assessorName: assessor.name,
    phase,
    finalStatus,
    items,
    summary: { same: count('same'), different: count('different'), noSuggestion: count('no_suggestion'), noFinal: count('no_final'), total: items.length },
  };
}
