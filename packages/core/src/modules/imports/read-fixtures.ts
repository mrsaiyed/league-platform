// Reads a fixtures spreadsheet saved as CSV (step 2.10; P7 section 4 "Also"; T-80).
// Pure: it takes the text and the season's teams and venues, and returns draft games plus
// a plain-words problem for every row it could not use. It writes and keeps nothing.
import { splitCsv } from './csv-text.ts';
import {
  isAmbiguousDate,
  normalizeName,
  parseDate,
  parseTime,
  parseWholeNumber,
} from './fixture-values.ts';

export const fixtureFileLimits = {
  maxCharacters: 2_000_000,
  maxRows: 5_000,
  maxColumns: 40,
  maxCellCharacters: 300,
  maxProblemsListed: 200,
  maxEchoCharacters: 40,
  maxScore: 999,
  maxGameNumber: 1_000_000,
} as const;

export type SeasonTeam = { id: string; name: string; shortName?: string };
export type SeasonVenue = { id: string; name: string; courts?: readonly string[] };
export type SeasonNames = {
  teams: readonly SeasonTeam[];
  venues: readonly SeasonVenue[];
};

export type DraftFixture = {
  /** The spreadsheet row it came from (row 1 is the header). */
  rowNumber: number;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM, 24-hour; null when the file gives none
  homeTeamId: string;
  awayTeamId: string;
  venueId: string | null;
  court: string | null;
  round: string | null;
  gameNumber: number | null;
  outsideReference: string | null;
  /** Present only when the row carries both final scores. */
  finalScore: { home: number; away: number } | null;
};

export type RowProblem = { rowNumber: number; message: string };

export type FixtureReport = {
  /** Set when the whole file is unusable; then there are no drafts. */
  fileProblem: string | null;
  fixtures: DraftFixture[];
  problems: RowProblem[];
  /** How many further rows had problems beyond the ones listed. */
  omittedProblems: number;
  /** Plain-words note for the end of the problem list, or null. */
  problemsNote: string | null;
  /** Things worth a look that do not stop a row being used. */
  warnings: RowProblem[];
  rowsRead: number;
  /** Plain-words names of the columns the reader found, for the preview. */
  columnsFound: string[];
};

type Field =
  | 'date'
  | 'time'
  | 'home'
  | 'away'
  | 'venue'
  | 'court'
  | 'round'
  | 'gameNumber'
  | 'reference'
  | 'homeScore'
  | 'awayScore';

const FIELD_LABELS: Record<Field, string> = {
  date: 'date',
  time: 'time',
  home: 'home team',
  away: 'away team',
  venue: 'venue',
  court: 'court',
  round: 'round',
  gameNumber: 'game number',
  reference: 'outside reference',
  homeScore: 'home score',
  awayScore: 'away score',
};

const HEADER_NAMES: Record<Field, readonly string[]> = {
  date: ['date', 'game date'],
  time: ['time', 'start', 'start time', 'tip off', 'tipoff'],
  home: ['home', 'home team', 'hometeam'],
  away: ['away', 'away team', 'visitor', 'visitors', 'visiting team', 'awayteam'],
  venue: ['venue', 'location', 'gym', 'site', 'facility'],
  court: ['court', 'field', 'court name', 'court number', 'court no'],
  round: ['round', 'week', 'matchday', 'game week'],
  gameNumber: ['game number', 'game no', 'game id', 'match number'],
  reference: [
    'outside reference',
    'reference',
    'external id',
    'external reference',
    'source id',
    'id',
  ],
  homeScore: ['home score', 'score home', 'home pts', 'home points', 'final home'],
  awayScore: ['away score', 'score away', 'away pts', 'away points', 'final away', 'visitor score'],
};

const lookup = new Map<string, Field>();
for (const field of Object.keys(HEADER_NAMES) as Field[]) {
  for (const name of HEADER_NAMES[field]) lookup.set(normalizeName(name), field);
}

/** A value copied from the file into a message: control characters removed, kept short. */
function echo(value: string): string {
  const clean = value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ').trim();
  const max = fixtureFileLimits.maxEchoCharacters;
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

const SAVE_AS_CSV = 'Save it as CSV (UTF-8) from your spreadsheet program and try again.';

function wrongFormat(text: string): string | null {
  const nul = String.fromCharCode(0);
  const replacement = String.fromCharCode(0xfffd);
  const reversedMark = String.fromCharCode(0xfffe);
  if (text.startsWith('PK')) {
    return `This looks like an Excel file, not a CSV file. ${SAVE_AS_CSV}`;
  }
  if (text.includes(nul) || text.startsWith(reversedMark)) {
    return `The file is not plain text (it may be UTF-16 or a binary file). ${SAVE_AS_CSV}`;
  }
  if (text.includes(replacement)) {
    return `The file has characters that could not be read (it is probably not UTF-8). ${SAVE_AS_CSV}`;
  }
  return null;
}

function emptyReport(fileProblem: string | null, rowsRead = 0): FixtureReport {
  return {
    fileProblem,
    fixtures: [],
    problems: [],
    omittedProblems: 0,
    problemsNote: null,
    warnings: [],
    rowsRead,
    columnsFound: [],
  };
}

function indexNames<T extends { id: string }>(
  items: readonly T[],
  namesOf: (item: T) => string[],
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const item of items) {
    for (const name of namesOf(item)) {
      const key = normalizeName(name);
      if (key === '') continue;
      const ids = index.get(key) ?? [];
      if (!ids.includes(item.id)) ids.push(item.id);
      index.set(key, ids);
    }
  }
  return index;
}

function matchName(
  index: Map<string, string[]>,
  raw: string,
): { id: string } | { problem: 'none' | 'several' } {
  const ids = index.get(normalizeName(raw));
  if (!ids || ids.length === 0) return { problem: 'none' };
  if (ids.length > 1) return { problem: 'several' };
  return { id: ids[0] as string };
}

export function readFixtureSheet(csvText: string, season: SeasonNames): FixtureReport {
  const limits = fixtureFileLimits;
  if (csvText.length > limits.maxCharacters) {
    return emptyReport(
      `The file is too large (the limit is about ${Math.round(limits.maxCharacters / 1_000_000)} MB of text). Split it into smaller files.`,
    );
  }
  const wrong = wrongFormat(csvText);
  if (wrong) return emptyReport(wrong);
  const split = splitCsv(csvText);
  if (!split.ok) return emptyReport(split.message);

  const records = split.records;
  const headerIndex = records.findIndex((r) => r.cells.some((c) => c.trim() !== ''));
  if (headerIndex === -1) return emptyReport('The file is empty.');
  const header = records[headerIndex] as (typeof records)[number];
  if (header.cells.length > limits.maxColumns) {
    return emptyReport(
      `The file has more than ${limits.maxColumns} columns, which is not a fixtures sheet.`,
    );
  }

  // Find the columns.
  const columns = new Map<Field, number>();
  const warnings: RowProblem[] = [];
  header.cells.forEach((cell, index) => {
    const field = lookup.get(normalizeName(cell));
    if (!field) return;
    if (columns.has(field)) {
      warnings.push({
        rowNumber: header.row,
        message: `The first row has more than one "${FIELD_LABELS[field]}" column. I used the first and ignored the column "${echo(cell)}".`,
      });
    } else columns.set(field, index);
  });
  const missing = (['date', 'home', 'away'] as const).filter((f) => !columns.has(f));
  if (missing.length > 0) {
    return emptyReport(
      `The first row must name these columns: ${missing.map((f) => FIELD_LABELS[f]).join(', ')}. Put the column names in the first row.`,
    );
  }
  if (columns.has('homeScore') !== columns.has('awayScore')) {
    return emptyReport(
      'The file has only one of the two score columns. Either give both or neither.',
    );
  }

  const dataRecords = records
    .slice(headerIndex + 1)
    .filter((r) => r.cells.some((c) => c.trim() !== ''));
  const usedColumns = [...columns.entries()].map(([field, index]) => ({ field, index }));
  if (dataRecords.length > limits.maxRows) {
    return emptyReport(
      `The file has more than ${limits.maxRows} rows, which is over the limit. Split it into smaller files.`,
      dataRecords.length,
    );
  }

  const teamIndex = indexNames(season.teams, (t) => [
    t.name,
    ...(t.shortName ? [t.shortName] : []),
  ]);
  const venueIndex = indexNames(season.venues, (v) => [v.name]);
  const venuesById = new Map<string, SeasonVenue>(season.venues.map((v) => [v.id, v]));

  const fixtures: DraftFixture[] = [];
  const problems: RowProblem[] = [];
  const seenGameNumber = new Map<number, number>();
  const seenReference = new Map<string, number>();
  const seenSlot = new Map<string, number>();
  let rowsRead = 0;

  for (const record of dataRecords) {
    rowsRead++;
    const rowNumber = record.row;
    const issues: string[] = [];
    const cell = (field: Field): string => {
      const i = columns.get(field);
      return i === undefined ? '' : (record.cells[i] ?? '').trim();
    };

    const tooLong = usedColumns.find(
      (c) => (record.cells[c.index] ?? '').length > limits.maxCellCharacters,
    );
    if (tooLong) {
      problems.push({
        rowNumber,
        message: `Row ${rowNumber}: the ${FIELD_LABELS[tooLong.field]} cell is far too long to be a fixture detail.`,
      });
      continue;
    }

    const rawDate = cell('date');
    let date: string | null = null;
    if (rawDate === '') issues.push('The date is empty.');
    else {
      date = parseDate(rawDate);
      if (date && isAmbiguousDate(rawDate)) {
        warnings.push({
          rowNumber,
          message: `Row ${rowNumber}: the date "${echo(rawDate)}" was read month first (${date}). If your file puts the day first, check this row.`,
        });
      }
      if (!date) {
        issues.push(
          `The date "${echo(rawDate)}" is not a date I can read. Use a form like 2026-11-02 or 11/2/2026 (month first).`,
        );
      }
    }

    const rawTime = cell('time');
    let time: string | null = null;
    if (rawTime !== '') {
      time = parseTime(rawTime);
      if (!time) {
        issues.push(
          `The time "${echo(rawTime)}" is not a time I can read. Use a form like 7:30 PM or 19:30.`,
        );
      }
    }

    let homeId: string | null = null;
    let awayId: string | null = null;
    for (const side of ['home', 'away'] as const) {
      const raw = cell(side);
      if (raw === '') {
        issues.push(`The ${side} team is empty.`);
        continue;
      }
      const found = matchName(teamIndex, raw);
      if ('id' in found) {
        if (side === 'home') homeId = found.id;
        else awayId = found.id;
      } else if (found.problem === 'none') {
        issues.push(`The ${side} team "${echo(raw)}" is not a team in this season.`);
      } else {
        issues.push(`The ${side} team "${echo(raw)}" matches more than one team in this season.`);
      }
    }
    if (homeId !== null && homeId === awayId) {
      issues.push('The home and away teams are the same team.');
    }

    let venueId: string | null = null;
    const rawVenue = cell('venue');
    if (rawVenue !== '') {
      const found = matchName(venueIndex, rawVenue);
      if ('id' in found) venueId = found.id;
      else if (found.problem === 'none') {
        issues.push(`The venue "${echo(rawVenue)}" is not a venue in this season.`);
      } else
        issues.push(`The venue "${echo(rawVenue)}" matches more than one venue in this season.`);
    }

    const rawCourt = cell('court');
    let court: string | null = rawCourt === '' ? null : rawCourt;
    if (rawCourt !== '') {
      if (rawVenue === '') issues.push('A court is given without a venue.');
      else if (venueId !== null) {
        const courts = venuesById.get(venueId)?.courts ?? [];
        if (courts.length > 0) {
          const wanted = normalizeName(rawCourt);
          const bare = /^\d+$/.test(wanted) ? `court ${wanted}` : null;
          const found = courts.find((c) => {
            const key = normalizeName(c);
            return key === wanted || key === bare;
          });
          if (found) court = found;
          else issues.push(`The court "${echo(rawCourt)}" is not one of that venue's courts.`);
        }
      }
    }

    let gameNumber: number | null = null;
    const rawNumber = cell('gameNumber');
    if (rawNumber !== '') {
      gameNumber = parseWholeNumber(rawNumber, limits.maxGameNumber);
      if (gameNumber === null || gameNumber < 1) {
        gameNumber = null;
        issues.push(`The game number "${echo(rawNumber)}" is not a whole number of 1 or more.`);
      }
    }

    let finalScore: { home: number; away: number } | null = null;
    const rawHomeScore = cell('homeScore');
    const rawAwayScore = cell('awayScore');
    if (rawHomeScore !== '' || rawAwayScore !== '') {
      if (rawHomeScore === '' || rawAwayScore === '') {
        issues.push('Only one of the two final scores is filled in.');
      } else {
        const home = parseWholeNumber(rawHomeScore, limits.maxScore);
        const away = parseWholeNumber(rawAwayScore, limits.maxScore);
        if (home === null || away === null) {
          issues.push(
            `The scores "${echo(rawHomeScore)}" and "${echo(rawAwayScore)}" must be whole numbers from 0 to ${limits.maxScore}.`,
          );
        } else finalScore = { home, away };
      }
    }

    // Duplicates are judged against earlier rows that were themselves usable.
    const reference = cell('reference');
    if (gameNumber !== null) {
      const earlier = seenGameNumber.get(gameNumber);
      if (earlier !== undefined) {
        warnings.push({
          rowNumber,
          message: `Row ${rowNumber}: game number ${gameNumber} is also used on row ${earlier}.`,
        });
      }
    }
    if (reference !== '') {
      const earlier = seenReference.get(reference.toLowerCase());
      if (earlier !== undefined) {
        issues.push(
          `The outside reference "${echo(reference)}" is already used on row ${earlier}.`,
        );
      }
    }
    const slotKey = date && homeId && awayId ? `${date}|${time ?? ''}|${homeId}|${awayId}` : null;
    if (slotKey !== null) {
      const earlier = seenSlot.get(slotKey);
      if (earlier !== undefined) {
        issues.push(`This is the same game as row ${earlier} (same date, time and teams).`);
      }
    }

    if (issues.length > 0 || date === null || homeId === null || awayId === null) {
      problems.push({ rowNumber, message: `Row ${rowNumber}: ${issues.join(' ')}` });
      continue;
    }
    if (gameNumber !== null && !seenGameNumber.has(gameNumber)) {
      seenGameNumber.set(gameNumber, rowNumber);
    }
    if (reference !== '') seenReference.set(reference.toLowerCase(), rowNumber);
    if (slotKey !== null) seenSlot.set(slotKey, rowNumber);

    fixtures.push({
      rowNumber,
      date,
      time,
      homeTeamId: homeId,
      awayTeamId: awayId,
      venueId,
      court,
      round: cell('round') === '' ? null : cell('round'),
      gameNumber,
      outsideReference: reference === '' ? null : reference,
      finalScore,
    });
  }

  if (rowsRead === 0) return emptyReport('The file has column names but no games.');
  const omitted = Math.max(0, problems.length - limits.maxProblemsListed);
  return {
    fileProblem: null,
    fixtures,
    problems: problems.slice(0, limits.maxProblemsListed),
    omittedProblems: omitted,
    problemsNote: omitted > 0 ? `...and ${omitted} more rows have problems.` : null,
    warnings,
    rowsRead,
    columnsFound: [...columns.keys()].map((f) => FIELD_LABELS[f]),
  };
}
