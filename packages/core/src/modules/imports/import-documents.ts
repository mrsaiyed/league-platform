// The documents a fixtures import keeps in its row (T3 §11, T-50): versioned, their shapes
// here and not in the database. While the worker has not read the file, `report` holds the
// text that was uploaded (T-80: the file itself is never stored; its text rides in the row
// only until the worker has read it, and is replaced by the report). `created` holds the
// ids of what applying made, so undo can remove exactly that.
import { z } from 'zod';
import type { FixtureReport } from './read-fixtures.ts';

/**
 * The most the report document may hold, in bytes of its JSON text. The database refuses
 * a megabyte of the text form it stores (a little longer than this text), so stop short.
 */
export const maxReportBytes = 800_000;

export const uploadDocument = z.strictObject({ version: z.literal(1), upload: z.string() });

/** The text the admin uploaded, from a row still being read; undefined for any other report. */
export function uploadedText(report: unknown): string | undefined {
  const parsed = uploadDocument.safeParse(report);
  return parsed.success ? parsed.data.upload : undefined;
}

const problem = z.strictObject({ rowNumber: z.number().int(), message: z.string() });
const fixture = z.strictObject({
  rowNumber: z.number().int(),
  date: z.string(),
  time: z.string().nullable(),
  homeTeamId: z.string(),
  awayTeamId: z.string(),
  venueId: z.string().nullable(),
  court: z.string().nullable(),
  round: z.string().nullable(),
  gameNumber: z.number().int().nullable(),
  outsideReference: z.string().nullable(),
  finalScore: z.strictObject({ home: z.number().int(), away: z.number().int() }).nullable(),
});

const reportDocument = z.strictObject({
  version: z.literal(1),
  fileProblem: z.string().nullable(),
  fixtures: z.array(fixture),
  problems: z.array(problem),
  omittedProblems: z.number().int(),
  problemsNote: z.string().nullable(),
  warnings: z.array(problem),
  rowsRead: z.number().int(),
  columnsFound: z.array(z.string()),
});

export type FixtureReportDocument = FixtureReport & { readonly version: 1 };

export function reportDocumentOf(report: FixtureReport): FixtureReportDocument {
  return { version: 1, ...report };
}

/** The report of a read import, or undefined if the row does not hold one. */
export function parseFixtureReport(stored: unknown): FixtureReportDocument | undefined {
  const parsed = reportDocument.safeParse(stored);
  return parsed.success ? (parsed.data as FixtureReportDocument) : undefined;
}

/** A report that says only why nothing could be read. */
export function failedReport(fileProblem: string): FixtureReportDocument {
  return reportDocumentOf({
    fileProblem,
    fixtures: [],
    problems: [],
    omittedProblems: 0,
    problemsNote: null,
    warnings: [],
    rowsRead: 0,
    columnsFound: [],
  });
}

const createdDocument = z.strictObject({
  version: z.literal(1),
  /** The season's draft the games went into, and whether this import started it. */
  draftId: z.string(),
  draftStarted: z.boolean(),
  /** How many changes the draft held before and how many this import added after them. */
  changesBefore: z.number().int().min(0),
  changesAdded: z.number().int().min(0),
  /** The draft's version just after applying: undo only while it is still this. */
  draftVersion: z.number().int().positive(),
  gameIds: z.array(z.string()),
  /** Final scores the file gave, waiting for their games to be published. */
  scores: z.array(
    z.strictObject({
      gameId: z.string(),
      home: z.number().int(),
      away: z.number().int(),
      recorded: z.boolean(),
    }),
  ),
});

export type CreatedFixtures = z.infer<typeof createdDocument>;

export function parseCreatedFixtures(stored: unknown): CreatedFixtures | undefined {
  const parsed = createdDocument.safeParse(stored);
  return parsed.success ? parsed.data : undefined;
}

/**
 * A game id for one row of one import: made from the import's id and the row, so applying
 * the same import again names the same games and cannot add them twice. Shaped like a
 * UUID (version 8, variant 10) so every check on ids accepts it.
 */
export async function gameIdFor(importId: string, rowNumber: number): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`fixture-import:${importId.toLowerCase()}:${rowNumber}`),
    ),
  );
  const hex = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
