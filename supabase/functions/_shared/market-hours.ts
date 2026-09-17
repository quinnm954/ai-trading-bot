// ── US EQUITY SESSION LOGIC ──────────────────────────────────────────────────
// Stocks are not 24/7. Every stock entry decision has to know whether the
// regular session is open, how long is left in it, and when the next open is.
//
// The authoritative source is Alpaca's clock/calendar (real holidays and early
// closes, no hard-coded holiday list). This module wraps it and provides a
// weekday/ET fallback so a data outage can only ever make the engine MORE
// conservative — an unknown session is treated as closed.

import type { AlpacaCreds, CalendarDay } from './alpaca.ts';
import { getCalendar, getClock } from './alpaca.ts';

/** Do not open new stock positions inside the closing window. */
export const NO_NEW_ENTRY_MINUTES_BEFORE_CLOSE = 15;
/** Skip the opening auction chaos before taking a signal. */
export const NO_NEW_ENTRY_MINUTES_AFTER_OPEN = 5;

export interface SessionState {
  isOpen: boolean;
  /** Open AND far enough from both bells to accept a new entry. */
  entriesAllowed: boolean;
  minutesToClose: number | null;
  minutesSinceOpen: number | null;
  nextOpen: string | null;
  nextClose: string | null;
  /** True when this came from Alpaca rather than the local fallback. */
  authoritative: boolean;
  label: string;
}

const CLOSED_UNKNOWN: SessionState = {
  isOpen: false,
  entriesAllowed: false,
  minutesToClose: null,
  minutesSinceOpen: null,
  nextOpen: null,
  nextClose: null,
  authoritative: false,
  label: 'market session unknown — standing down',
};

export async function getSessionState(
  creds: AlpacaCreds | null,
  now: Date = new Date(),
): Promise<SessionState> {
  if (creds) {
    const clock = await getClock(creds);
    if (clock) {
      const minutesToClose = clock.nextClose && clock.isOpen
        ? Math.round((Date.parse(clock.nextClose) - now.getTime()) / 60000)
        : null;
      // Alpaca's clock gives next_open even while open; derive minutes-since-open
      // from the calendar entry for today instead.
      const minutesSinceOpen = clock.isOpen ? await minutesSinceTodaysOpen(creds, now) : null;

      const nearClose = minutesToClose != null && minutesToClose <= NO_NEW_ENTRY_MINUTES_BEFORE_CLOSE;
      const nearOpen = minutesSinceOpen != null && minutesSinceOpen < NO_NEW_ENTRY_MINUTES_AFTER_OPEN;
      const entriesAllowed = clock.isOpen && !nearClose && !nearOpen;

      return {
        isOpen: clock.isOpen,
        entriesAllowed,
        minutesToClose,
        minutesSinceOpen,
        nextOpen: clock.nextOpen,
        nextClose: clock.nextClose,
        authoritative: true,
        label: clock.isOpen
          ? entriesAllowed
            ? `market open, ${minutesToClose ?? '?'} min to close`
            : nearClose
              ? `market closing in ${minutesToClose} min — no new entries`
              : `first ${NO_NEW_ENTRY_MINUTES_AFTER_OPEN} min after the open — no new entries`
          : `market closed, next open ${clock.nextOpen ?? 'unknown'}`,
      };
    }
  }

  return fallbackSession(now);
}

async function minutesSinceTodaysOpen(creds: AlpacaCreds, now: Date): Promise<number | null> {
  const day = now.toISOString().slice(0, 10);
  const days: CalendarDay[] = await getCalendar(creds, day, day);
  const today = days[0];
  if (!today) return null;
  const openMinutes = parseHHMM(today.open);
  const nowMinutes = etMinutes(now);
  if (openMinutes == null || nowMinutes == null) return null;
  return nowMinutes - openMinutes;
}

/**
 * Local fallback: regular hours 09:30–16:00 ET, Monday–Friday. Holidays are NOT
 * known here, so this path is used only when Alpaca is unreachable and it stays
 * deliberately conservative.
 */
export function fallbackSession(now: Date = new Date()): SessionState {
  const parts = etParts(now);
  if (!parts) return { ...CLOSED_UNKNOWN };

  const { weekday, minutes } = parts;
  const isWeekday = weekday >= 1 && weekday <= 5;
  const openM = 9 * 60 + 30;
  const closeM = 16 * 60;
  const isOpen = isWeekday && minutes >= openM && minutes < closeM;
  const minutesToClose = isOpen ? closeM - minutes : null;
  const minutesSinceOpen = isOpen ? minutes - openM : null;
  const entriesAllowed = isOpen
    && (minutesToClose ?? 0) > NO_NEW_ENTRY_MINUTES_BEFORE_CLOSE
    && (minutesSinceOpen ?? 0) >= NO_NEW_ENTRY_MINUTES_AFTER_OPEN;

  return {
    isOpen,
    entriesAllowed,
    minutesToClose,
    minutesSinceOpen,
    nextOpen: null,
    nextClose: null,
    authoritative: false,
    label: isOpen
      ? `market open (local clock), ${minutesToClose} min to close`
      : 'market closed (local clock; holiday calendar unavailable)',
  };
}

/** True when the given instant falls inside a regular US equity session. */
export function isRegularSessionInstant(at: Date): boolean {
  const parts = etParts(at);
  if (!parts) return false;
  const { weekday, minutes } = parts;
  return weekday >= 1 && weekday <= 5 && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

function etParts(d: Date): { weekday: number; minutes: number } | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? NaN);
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    if (!(wd in map) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { weekday: map[wd], minutes: (hour % 24) * 60 + minute };
  } catch (_e) {
    return null;
  }
}

function etMinutes(d: Date): number | null {
  return etParts(d)?.minutes ?? null;
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
