// How a schedule button's answer travels back to the grid in its address (step 2.160),
// beyond the fixed words notice.ts turns into text: what was saved (a round, a game, the
// place of a removed one), so the grid says "Saved" beside it and the address's anchor
// takes the phone there; and, for a refused round form, which form it was and what was
// typed in it, so the form opens again with it kept and the reason beside it. Ids must be
// ids, and typed text is only ever put back into its own field, never shown as text (T-187).
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
    case 'game-removed':
      return {
        query: {
          ...query,
          saved: detail.what,
          ...(detail.roundId === null ? {} : { round: detail.roundId }),
          // Which game, so "Put it back" can be offered; what it was is the draft's to say.
          ...(detail.gameId === undefined ? {} : { game: detail.gameId }),
        },
        hash,
      };
    case 'game-saved':
    case 'game-round':
      return { query: { ...query, saved: detail.what, game: detail.gameId }, hash };
    case 'game-put-back':
      return {
        query: {
          ...query,
          saved: detail.what,
          game: detail.gameId,
          // The round it was in, removed from the draft since: it came back with no round.
          ...(detail.fromRoundId === undefined ? {} : { round: detail.fromRoundId }),
        },
        hash,
      };
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
    case 'game-removed': {
      const roundId = idOf(round) ?? null;
      const gameId = idOf(first(search['game']));
      return gameId === undefined ? { what, roundId } : { what, roundId, gameId };
    }
    case 'game-saved':
    case 'game-round': {
      const gameId = idOf(first(search['game']));
      return gameId === undefined ? undefined : { what, gameId };
    }
    case 'game-put-back': {
      const gameId = idOf(first(search['game']));
      const fromRoundId = idOf(round);
      if (gameId === undefined) return undefined;
      return fromRoundId === undefined ? { what, gameId } : { what, gameId, fromRoundId };
    }
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
