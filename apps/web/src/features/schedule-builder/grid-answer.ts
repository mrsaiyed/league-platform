// How a schedule button's answer travels back to the grid in its address (step 2.160),
// beyond the fixed words notice.ts turns into text: which round was added or which game
// went to another round (so the grid can name it and offer the round's date), and, for a
// refused round form, which form it was and what was typed in it, so the form opens again
// with it kept and the reason beside it. Ids must be ids and typed text is only ever put
// back into its own field, never shown as text (T-187).
import type { RefusedAt, SavedDetail, ScheduleActionOutcome } from './run-schedule-action.ts';

type Search = Readonly<Record<string, string | readonly string[] | undefined>>;

const first = (value: string | readonly string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : value?.[0];

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const dateShape = /^\d{4}-\d{2}-\d{2}$/;
const idOf = (value: string | undefined): string | undefined =>
  value !== undefined && uuidShape.test(value) ? value : undefined;

/** The anchor of a round's section, and of the "Add a round" form. */
export const roundAnchor = (roundId: string): string => `round-${roundId}`;
export const addRoundAnchor = 'add-round';

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
  switch (detail.what) {
    case 'round-added':
      return { query: { ...query, saved: detail.what, round: detail.roundId }, hash: '' };
    case 'round-removed':
      return { query: { ...query, saved: detail.what }, hash: '' };
    case 'game-round':
      return { query: { ...query, saved: detail.what, game: detail.gameId }, hash: '' };
  }
}

/** What a save the address names did, if it names one we know. */
export function savedDetailOf(search: Search): SavedDetail | undefined {
  if (first(search['done']) !== 'saved') return undefined;
  const what = first(search['saved']);
  if (what === 'round-removed') return { what };
  if (what === 'round-added') {
    const roundId = idOf(first(search['round']));
    return roundId === undefined ? undefined : { what, roundId };
  }
  if (what === 'game-round') {
    const gameId = idOf(first(search['game']));
    return gameId === undefined ? undefined : { what, gameId };
  }
  return undefined;
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
