import { getCollection, type CollectionEntry } from 'astro:content';

export type EventEntry = CollectionEntry<'events'>;

export function endOfDayUTC(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  return new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
}

export function normalizeNoonUTC(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  return new Date(Date.UTC(y, m, d, 12, 0, 0));
}

function getEffectiveEnd(event: EventEntry): Date {
  const { startDate, endDate, allDay } = event.data;
  if (endDate) {
    // If all-day spans multiple days, end at end-of-day of endDate; otherwise use noon-UTC for stability.
    return allDay ? endOfDayUTC(new Date(endDate)) : normalizeNoonUTC(new Date(endDate));
  }
  // No explicit end: allDay -> end of start day; else use start date (instantaneous)
  return allDay ? endOfDayUTC(new Date(startDate)) : normalizeNoonUTC(new Date(startDate));
}

function getEffectiveStart(event: EventEntry): Date {
  const { startDate, allDay } = event.data;
  return allDay ? normalizeNoonUTC(new Date(startDate)) : normalizeNoonUTC(new Date(startDate));
}

export function isUpcoming(event: EventEntry, now = new Date()): boolean {
  const endAt = getEffectiveEnd(event);
  return now.getTime() <= endAt.getTime();
}

export async function getUpcomingEvents(limit?: number): Promise<EventEntry[]> {
  const events = await getCollection('events', ({ data }) => data.draft !== true);
  const upcoming = events
    .filter((e) => isUpcoming(e))
    .sort((a, b) => getEffectiveStart(a).getTime() - getEffectiveStart(b).getTime());
  return typeof limit === 'number' ? upcoming.slice(0, limit) : upcoming;
}

export async function getAllEventsSorted() {
  const events = await getCollection('events', ({ data }) => data.draft !== true);
  const upcoming = [] as EventEntry[];
  const past = [] as EventEntry[];
  for (const e of events) {
    (isUpcoming(e) ? upcoming : past).push(e);
  }
  upcoming.sort((a, b) => getEffectiveStart(a).getTime() - getEffectiveStart(b).getTime());
  past.sort((a, b) => getEffectiveStart(b).getTime() - getEffectiveStart(a).getTime());
  return { upcoming, past };
}

export function formatEventDateRange(
  start: Date,
  end?: Date,
  opts?: { includeTime?: boolean; timeZone?: string; timeZoneLabel?: string }
): string {
  const s = new Date(start);
  const e = end ? new Date(end) : undefined;
  const tz = opts?.timeZone ?? 'UTC';

  const sDate = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz });
  if (!e) {
    if (!opts?.includeTime) return sDate;
    const sTime = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
    return `${sDate}, ${sTime}${opts?.timeZoneLabel ? ` ${opts.timeZoneLabel}` : ''}`;
  }

  const sameDay =
    s.getUTCFullYear() === e.getUTCFullYear() &&
    s.getUTCMonth() === e.getUTCMonth() &&
    s.getUTCDate() === e.getUTCDate();

  if (!opts?.includeTime) {
    if (sameDay) return sDate;
    const eDate = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz });
    if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
      return `${s.toLocaleDateString('en-US', { month: 'short', timeZone: tz })} ${s.getUTCDate()}–${e.getUTCDate()}, ${s.getUTCFullYear()}`;
    }
    return `${sDate} – ${eDate}`;
  }

  if (sameDay) {
    const sTime = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
    const eTime = e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
    return `${sDate}, ${sTime} – ${eTime}${opts?.timeZoneLabel ? ` ${opts.timeZoneLabel}` : ''}`;
  }

  const eDate = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz });
  return `${sDate} ${s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })} – ${eDate} ${e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })}${opts?.timeZoneLabel ? ` ${opts.timeZoneLabel}` : ''}`;
}

export function eventHref(e: EventEntry): string {
  return e.data.url ? e.data.url : `/events/${e.slug}`;
}
