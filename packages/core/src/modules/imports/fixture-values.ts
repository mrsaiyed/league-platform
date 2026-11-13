// Reads one cell at a time: dates, times, whole numbers and names.

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function validDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthNumber(word: string): number | null {
  const w = word.toLowerCase();
  if (w.length < 3) return null;
  const index = MONTHS.findIndex(
    (name) => name === w || ((w.length === 3 || w === 'sept') && name.startsWith(w)),
  );
  return index === -1 ? null : index + 1;
}

function fullYear(text: string): number {
  const n = Number(text);
  return text.length === 2 ? 2000 + n : n;
}

const WEEKDAY_PREFIX = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,? +/i;

/**
 * 2026-11-02, 11/2/2026 or 11/2/26 (month first), "Nov 2, 2026", "2 November 2026", with an
 * optional weekday in front ("Tuesday, November 03, 2026"). Returns YYYY-MM-DD.
 */
export function parseDate(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ').replace(WEEKDAY_PREFIX, '');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(s);
  if (m) return validDate(fullYear(m[3] as string), Number(m[1]), Number(m[2]));
  m = /^([a-z]{3,9})\.? (\d{1,2}),? (\d{4}|\d{2})$/i.exec(s);
  if (m) {
    const month = monthNumber(m[1] as string);
    return month ? validDate(fullYear(m[3] as string), month, Number(m[2])) : null;
  }
  m = /^(\d{1,2}) ([a-z]{3,9})\.?,? (\d{4}|\d{2})$/i.exec(s);
  if (m) {
    const month = monthNumber(m[2] as string);
    return month ? validDate(fullYear(m[3] as string), month, Number(m[1])) : null;
  }
  return null;
}

/** True for a slash date such as 3/4/2026 that reads differently day-first and month-first. */
export function isAmbiguousDate(raw: string): boolean {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(raw.trim());
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a <= 12 && b <= 12 && a !== b;
}

/** 19:30, 7:30 PM, 7pm. Returns HH:MM on a 24-hour clock. */
export function parseTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  const m = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})? ?(am|pm)?$/.exec(s);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  const half = m[3];
  if (minute > 59) return null;
  if (half) {
    if (hour < 1 || hour > 12) return null;
    if (half === 'am' && hour === 12) hour = 0;
    if (half === 'pm' && hour !== 12) hour += 12;
  } else if (m[2] === undefined) {
    return null; // a bare number such as "7" is too easy to misread
  }
  if (hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseWholeNumber(raw: string, max: number): number | null {
  const s = raw.trim();
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  return n <= max ? n : null;
}

/** Lowercase, accents and punctuation removed, spaces collapsed: for matching names in any script. */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
