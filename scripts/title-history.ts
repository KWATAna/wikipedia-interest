/** Assign historical article titles only where a verified move chain covers a full month. */

import type { MoveEvent } from './client.ts';

export interface TitleAssignment {
  status: 'unchecked' | 'verified-move' | 'uncertain';
  byMonth: Record<string, string | null>;
  uncertainMonths: string[];
  events: MoveEvent[];
}

export function assignMonthlyTitles(currentTitle: string, pageId: number, formerTitles: string[],
  events: MoveEvent[], months: string[]): TitleAssignment {
  const unknown = (): TitleAssignment => ({ status: 'uncertain',
    byMonth: Object.fromEntries(months.map(month => [month, null])), uncertainMonths: [...months], events: [] });
  if (formerTitles.length === 0) return { status: 'unchecked',
    byMonth: Object.fromEntries(months.map(month => [month, currentTitle])), uncertainMonths: [], events: [] };
  const relevant = [...new Map(events.filter(event => event.logpage === pageId && event.ns === 0
    && event.targetNs === 0).map(event => [event.logId, event])).values()]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (relevant.length === 0 || relevant.at(-1)?.to !== currentTitle
    || relevant.some((event, index) => !Number.isFinite(Date.parse(event.timestamp))
      || !event.from || !event.to || event.from === event.to
      || (index > 0 && (relevant[index - 1].to !== event.from
        || relevant[index - 1].timestamp === event.timestamp)))
    || formerTitles.some(title => !relevant.some(event => event.from === title))) return unknown();
  const byMonth: Record<string, string | null> = {};
  const uncertainMonths: string[] = [];
  for (const month of months) {
    const [year, part] = month.split('-').map(Number);
    const start = Date.UTC(year, part - 1, 1);
    const end = Date.UTC(year, part, 1);
    if (relevant.some(event => Date.parse(event.timestamp) >= start && Date.parse(event.timestamp) < end)) {
      byMonth[month] = null;
      uncertainMonths.push(month);
    } else {
      const previous = relevant.filter(event => Date.parse(event.timestamp) < start).at(-1);
      byMonth[month] = previous?.to ?? relevant[0].from;
    }
  }
  return { status: 'verified-move', byMonth, uncertainMonths, events: relevant };
}
