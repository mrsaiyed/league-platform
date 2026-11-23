// How a schedule button's answer travels back to the grid in its address (step 2.160),
// beyond the fixed words notice.ts turns into text: what was saved (a round, a game, the
// place of a removed one), so the grid says "Saved" beside it and the address's anchor
// takes the phone there; and, for a refused round form, which form it was and what was
// typed in it, so the form opens again with it kept and the reason beside it. Ids must be
// ids, and typed text is only ever put back into its own field, never shown as text (T-187).
//
// A game removed, put back or already back is answered by a one-time notice instead (record
// 067, step 2.185): the address holds only the place, so a reload, or the phone's Back to
// it, never shows an old "Removed … Put it back".
import { gameAnchor } from '@srleagues/core';
import type { SavedNotice } from '../../server/saved-notice.ts';
import type { RefusedAt, SavedDetail, ScheduleActionOutcome } from './run-schedule-action.ts';

type Search = Readonly<Record<string, string | readonly string[] | undefined>>;

const first = (value: string | readonly string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : value?.[0];

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const dateShape = /^\d{4}-\d{2}-\d{2}$/;
const idOf = (value: string | undefined): string | undefined =>
  value !== undefined && uuidShape.test(value) ? value : undefined;

/**
 * The anchors: a round's section, the "Add a round" form, a "Saved". A game's line carries
 * core's gameAnchor, the one maker of that anchor.
 */
export const roundAnchor = (roundId: string): string => `round-${roundId}`;
export const addRoundAnchor = 'add-round';
export const savedAnchor = 'saved';

/** The address's query and anchor for an answer (the caller adds the season). */
export function answerParams(outcome: ScheduleActionOutcome): {
  readonly query: Readonly<Record<string, string>>;
  readonly hash: string;
} {
  if (outcome.kind === 'refused') {
    const query: Record<string, string> = { problem: outcome.code };
    if (outcome.reason !== undefined) query['reason'] = outcome.reason;
    if (outcome.partial === true) query['partial'] = '1';
    const at = outcome.at;
    if (at === undefined) return { query, hash: '' };
    if (at.form === 'round') {
      return {
        query: { ...query, at: 'round', round: at.roundId },
        hash: `#${roundAnchor(at.roundId)}`,
      };
    }
    return {
      query: {
        ...query,
        at: 'add-round',
        label: at.label.slice(0, 120),
        date: at.date.slice(0, 10),
      },
      hash: `#${addRoundAnchor}`,
    };
  }
  const query: Record<string, string> = { done: outcome.kind };
  // How many games the publish moved to the bin, for "Moved to the bin" with the way back.
  if (outcome.kind === 'published' && (outcome.removed ?? 0) > 0) {
    return { query: { ...query, removed: String(outcome.removed) }, hash: '' };
  }
  if (outcome.kind !== 'saved' || outcome.detail === undefined) return { query, hash: '' };
  const detail = outcome.detail;
  const hash = `#${savedAnchor}`;
  switch (detail.what) {
    case 'round-added':
    case 'round-saved':
      return { query: { ...query, saved: detail.what, round: detail.roundId }, hash };
    case 'round-removed':
      return {
        query: {
          ...query,
          saved: detail.what,
          ...(detail.afterRoundId === null ? {} : { after: detail.afterRoundId }),
        },
        hash,
      };
    // An answer said at a game takes the phone to the game's row, so its name is in view
    // above the answer, not under the bar at the top (step 2.185).
    case 'game-saved':
    case 'game-round':
      return {
        query: { ...query, saved: detail.what, game: detail.gameId },
        hash: `#${gameAnchor(detail.gameId)}`,
      };
    case 'game-removed':
      // Said by the one-time notice (noticeOfAnswer); the address keeps only the place:
      // the struck row, or the round of a game only ever in the draft.
      return {
        query: {},
        hash:
          detail.stays === true && detail.gameId !== undefined
            ? `#${gameAnchor(detail.gameId)}`
            : hash,
      };
    case 'game-put-back':
    case 'game-already-back':
      return { query: {}, hash: `#${gameAnchor(detail.gameId)}` };
  }
}

/** What a notice holds of an answer: the screen is the schedule's. */
export type GridNotice = Omit<SavedNotice, 'screen'>;

/**
 * The answers that travel as a one-time notice (step 2.185): which game, what was done and,
 * for a removal, the round it was in, or for a put back, the round the draft had removed
 * since. Undefined for every other answer, which still rides in the address.
 */
export function noticeOfAnswer(outcome: ScheduleActionOutcome): GridNotice | undefined {
  if (outcome.kind !== 'saved' || outcome.detail === undefined) return undefined;
  const detail = outcome.detail;
  switch (detail.what) {
    case 'game-removed':
      if (detail.gameId === undefined) return undefined;
      return {
        thing: detail.gameId,
        said: detail.what,
        ...(detail.roundId === null ? {} : { about: [detail.roundId] }),
      };
    case 'game-put-back':
      return {
        thing: detail.gameId,
        said: detail.what,
        ...(detail.fromRoundId === undefined ? {} : { about: [detail.fromRoundId] }),
      };
    case 'game-already-back':
      return { thing: detail.gameId, said: detail.what };
    default:
      return undefined;
  }
}

/** The answer a notice the grid took says, if it is one of ours with ids that are ids. */
export function savedDetailOfNotice(notice: GridNotice | undefined): SavedDetail | undefined {
  if (notice === undefined) return undefined;
  const gameId = idOf(notice.thing);
  const about = idOf(notice.about?.[0]);
  if (gameId === undefined) return undefined;
  switch (notice.said) {
    case 'game-removed':
      return { what: 'game-removed', roundId: about ?? null, gameId };
    case 'game-put-back':
      return about === undefined
        ? { what: 'game-put-back', gameId }
        : { what: 'game-put-back', gameId, fromRoundId: about };
    case 'game-already-back':
      return { what: 'game-already-back', gameId };
    default:
      return undefined;
  }
}

/** What a save the address names did, if it names one we know. */
export function savedDetailOf(search: Search): SavedDetail | undefined {
  if (first(search['done']) !== 'saved') return undefined;
  const what = first(search['saved']);
  const round = first(search['round']);
  switch (what) {
    case 'round-added':
    case 'round-saved': {
      const roundId = idOf(round);
      return roundId === undefined ? undefined : { what, roundId };
    }
    case 'round-removed':
      return { what, afterRoundId: idOf(first(search['after'])) ?? null };
    case 'game-saved':
    case 'game-round': {
      const gameId = idOf(first(search['game']));
      return gameId === undefined ? undefined : { what, gameId };
    }
    // A removal or a put back is never read from the address (step 2.185): an old address
    // that still names one says no more than "Saved".
    default:
      return undefined;
  }
}

/** The form a refusal belongs beside, with what was typed in it, if the address names one. */
export function refusedAtOf(search: Search): RefusedAt | undefined {
  if (first(search['problem']) === undefined) return undefined;
  const at = first(search['at']);
  if (at === 'round') {
    const roundId = idOf(first(search['round']));
    return roundId === undefined ? undefined : { form: 'round', roundId };
  }
  if (at === 'add-round') {
    const label = (first(search['label']) ?? '').slice(0, 120);
    const typedDate = first(search['date']) ?? '';
    return { form: 'add-round', label, date: dateShape.test(typedDate) ? typedDate : '' };
  }
  return undefined;
}
