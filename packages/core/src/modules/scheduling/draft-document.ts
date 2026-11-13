// The schedule draft's changes as the database holds them (T3 §8): a versioned
// document (T-50) whose shape is here, not in the database. Version 1 is a list of
// the changes the admin made, in order, each one of the rules' DraftChange kinds.
import { z } from 'zod';
import type { DraftChange } from './rules/schedule-types.ts';

const text = z.string().min(1).max(100);
const slot = z.strictObject({
  roundId: text.nullable(),
  date: z.string().max(10),
  time: z.string().max(5).nullable(),
  venueId: text.nullable(),
  court: z.string().max(100).nullable(),
});
export const gameRecording = z.enum(['final-score', 'box-score', 'live']);

const game = slot.extend({
  id: text,
  recording: gameRecording.nullable().optional(),
  homeTeamId: text,
  awayTeamId: text,
  status: z.enum(['scheduled', 'live', 'final', 'postponed', 'cancelled', 'forfeit']),
});

const change = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('add-game'), game }),
  z.strictObject({ kind: z.literal('move-game'), gameId: text, to: slot }),
  z.strictObject({ kind: z.literal('swap-games'), gameId: text, otherGameId: text }),
  z.strictObject({ kind: z.literal('remove-game'), gameId: text }),
  z.strictObject({
    kind: z.literal('set-recording'),
    gameId: text,
    recording: gameRecording,
  }),
  z.strictObject({ kind: z.literal('rename-round'), roundId: text, label: z.string().max(120) }),
  z.strictObject({ kind: z.literal('change-round-date'), roundId: text, date: z.string().max(10) }),
]);

export const draftDocument = z.strictObject({
  version: z.literal(1),
  changes: z.array(change),
});

export type DraftDocument = { readonly version: 1; readonly changes: readonly DraftChange[] };

/** The changes of a stored draft, or undefined if the document is not one this code can read. */
export function parseDraftDocument(stored: unknown): DraftDocument | undefined {
  const parsed = draftDocument.safeParse(stored);
  return parsed.success ? (parsed.data as DraftDocument) : undefined;
}

/**
 * The most a draft may hold, in bytes of its JSON text. The database refuses a megabyte of
 * the text form it stores (octet_length of the jsonb as text, a little longer than this text
 * because it spaces after colons and commas), so stop well short of it.
 */
export const maxDraftBytes = 700_000;

export const emptyDraft: DraftDocument = { version: 1, changes: [] };
