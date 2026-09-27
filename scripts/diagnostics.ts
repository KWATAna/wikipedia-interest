/** Secondary trend diagnostics; these never replace the ordinary 12-month screen. */

import type { ArticleTrend, NullableMonthlySeries, PeakPairSensitivity } from './types.ts';

const percentChange = (recent: number, prior: number): number | null =>
  prior > 0 ? (recent / prior - 1) * 100 : null;

const changedSign = (ordinary: number | null, sensitivity: number | null): boolean | null =>
  ordinary !== null && sensitivity !== null && Number.isFinite(ordinary) && Number.isFinite(sensitivity)
    ? Math.sign(ordinary) !== Math.sign(sensitivity) : null;

function unavailable(status: 'incomplete-data' | 'zero-traffic'): PeakPairSensitivity {
  return { status, peakMonth: null, excludedMonths: null,
    viewsPrior: null, viewsRecent: null, viewsYoyPct: null,
    sharePriorPerMillion: null, shareRecentPerMillion: null, shareYoyPct: null,
    rawDirectionChanged: null, shareDirectionChanged: null };
}

export function calculatePeakPairSensitivity(months: string[], selectedViews: NullableMonthlySeries,
  editionViews: NullableMonthlySeries, ordinaryRawYoY: number | null,
  ordinaryShareYoY: number | null): PeakPairSensitivity {
  if (months.length !== 24 || months.some(month =>
    typeof selectedViews[month] !== 'number' || !Number.isFinite(selectedViews[month])
    || selectedViews[month]! < 0 || typeof editionViews[month] !== 'number'
    || !Number.isFinite(editionViews[month]) || editionViews[month]! <= 0)) {
    return unavailable('incomplete-data');
  }
  const values = months.map(month => selectedViews[month]!);
  const peak = Math.max(...values);
  if (peak === 0) return unavailable('zero-traffic');
  const peakIndex = values.indexOf(peak);
  const pairIndex = peakIndex % 12;
  const priorMonths = months.slice(0, 12).filter((_, index) => index !== pairIndex);
  const recentMonths = months.slice(12).filter((_, index) => index !== pairIndex);
  const sum = (period: string[], series: NullableMonthlySeries): number =>
    period.reduce((total, month) => total + series[month]!, 0);
  const viewsPrior = sum(priorMonths, selectedViews);
  const viewsRecent = sum(recentMonths, selectedViews);
  const sharePriorPerMillion = viewsPrior / sum(priorMonths, editionViews) * 1e6;
  const shareRecentPerMillion = viewsRecent / sum(recentMonths, editionViews) * 1e6;
  const viewsYoyPct = percentChange(viewsRecent, viewsPrior);
  const shareYoyPct = percentChange(shareRecentPerMillion, sharePriorPerMillion);
  return { status: viewsPrior === 0 ? 'zero-baseline' : 'available',
    peakMonth: months[peakIndex],
    excludedMonths: { prior: months[pairIndex], recent: months[pairIndex + 12] },
    viewsPrior, viewsRecent, viewsYoyPct, sharePriorPerMillion, shareRecentPerMillion,
    shareYoyPct, rawDirectionChanged: changedSign(ordinaryRawYoY, viewsYoyPct),
    shareDirectionChanged: changedSign(ordinaryShareYoY, shareYoyPct) };
}

export function calculateArticleTrends(months: string[],
  articleMonthlyViews: Record<string, NullableMonthlySeries>): ArticleTrend[] {
  const window = months.slice(-24);
  return Object.entries(articleMonthlyViews).map(([title, series]) => {
    if (window.length !== 24 || window.some(month =>
      typeof series[month] !== 'number' || !Number.isFinite(series[month]) || series[month]! < 0)) {
      return { title, viewsPrior: null, viewsRecent: null, viewsYoyPct: null,
        direction: 'unavailable' };
    }
    const sum = (period: string[]): number => period.reduce((total, month) => total + series[month]!, 0);
    const viewsPrior = sum(window.slice(0, 12));
    const viewsRecent = sum(window.slice(12));
    return { title, viewsPrior, viewsRecent, viewsYoyPct: percentChange(viewsRecent, viewsPrior),
      direction: viewsRecent > viewsPrior ? 'rising' : viewsRecent < viewsPrior ? 'falling' : 'flat' };
  });
}
