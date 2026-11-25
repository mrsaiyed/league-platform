// How the grid says what just happened. The address carries only fixed words
// (`?done=saved`, `?problem=changed-since-read`); the words themselves are looked up
// here, so nothing a visitor types into an address can become text on the page.
import { maxRounds, roundYears } from '@srleagues/core';
import type { TextKey } from '../../server/messages.ts';
import { t } from '../../server/messages.ts';
import type { GameTyped } from './run-schedule-action.ts';

type Search = Readonly<Record<string, string | readonly string[] | undefined>>;

const first = (value: string | readonly string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : value?.[0];

export type Notice = { readonly kind: 'done' | 'problem'; readonly text: string };

const done = {
  saved: () => t('schedule.admin.saved'),
  published: () => t('schedule.admin.published'),
  discarded: () => t('schedule.admin.discarded'),
} as const;

const problems = {
  'not-allowed': () => t('schedule.admin.error.not-allowed'),
  'invalid-input': () => t('schedule.admin.error.invalid-input'),
  'changed-since-read': () => t('schedule.admin.error.changed-since-read'),
  'revision-out-of-date': () => t('schedule.admin.error.revision-out-of-date'),
  'season-not-found': () => t('schedule.admin.error.season-not-found'),
  'draft-unreadable': () => t('schedule.admin.error.draft-unreadable'),
  'draft-too-large': () => t('schedule.admin.error.draft-too-large'),
  'unknown-team': () => t('schedule.admin.error.unknown-team'),
  'team-left': () => t('schedule.admin.error.team-left'),
  'unknown-venue': () => t('schedule.admin.error.unknown-venue'),
  'unknown-court': () => t('schedule.admin.error.unknown-court'),
  'draft-not-found': () => t('schedule.admin.error.draft-not-found'),
  'round-cannot-be-updated': () => t('schedule.admin.error.round-cannot-be-updated'),
  'change-refused': () => t('schedule.admin.error.change-refused'),
  'game-already-started': () => t('schedule.admin.error.game-already-started'),
  'game-cannot-be-removed': () => t('schedule.admin.error.game-cannot-be-removed'),
  'game-id-taken': () => t('schedule.admin.error.game-id-taken'),
  'game-without-time': () => t('schedule.admin.error.game-without-time'),
  'change-no-longer-fits': () => t('schedule.admin.error.change-no-longer-fits'),
  'nothing-to-publish': () => t('schedule.admin.error.nothing-to-publish'),
  'round-in-use': () => t('schedule.admin.error.round-in-use'),
  'round-cannot-be-added': () => t('schedule.admin.error.round-cannot-be-added'),
  'nothing-to-put-back': () => t('schedule.admin.error.nothing-to-put-back'),
} as const;

const reasons = {
  'unknown-game': () => t('schedule.admin.refused.unknown-game'),
  'unknown-round': () => t('schedule.admin.refused.unknown-round'),
  'game-exists': () => t('schedule.admin.refused.game-exists'),
  'team-plays-itself': () => t('schedule.admin.refused.team-plays-itself'),
  'swap-with-itself': () => t('schedule.admin.refused.swap-with-itself'),
  'empty-round-label': () => t('schedule.admin.refused.empty-round-label'),
  'invalid-date': () => t('schedule.admin.refused.invalid-date'),
  'invalid-time': () => t('schedule.admin.refused.invalid-time'),
  'round-exists': () => t('schedule.admin.refused.round-exists'),
  'round-has-games': () => t('schedule.admin.refused.round-has-games'),
  'too-many-rounds': () => t('schedule.admin.refused.too-many-rounds', { max: maxRounds }),
  'date-out-of-range': () =>
    t('schedule.admin.refused.date-out-of-range', {
      first: roundYears.first,
      last: roundYears.last,
    }),
} as const;

const blockers = {
  'nothing-to-publish': () => t('schedule.admin.blocker.nothing-to-publish'),
  'revision-out-of-date': () => t('schedule.admin.blocker.revision-out-of-date'),
  'change-no-longer-fits': () => t('schedule.admin.blocker.change-no-longer-fits'),
  'game-already-started': () => t('schedule.admin.blocker.game-already-started'),
  'game-cannot-be-removed': () => t('schedule.admin.blocker.game-cannot-be-removed'),
  'game-id-taken': () => t('schedule.admin.blocker.game-id-taken'),
  'game-without-time': () => t('schedule.admin.blocker.game-without-time'),
  'unknown-team': () => t('schedule.admin.blocker.unknown-team'),
  'team-left': () => t('schedule.admin.blocker.team-left'),
  'unknown-venue': () => t('schedule.admin.blocker.unknown-venue'),
  'unknown-court': () => t('schedule.admin.blocker.unknown-court'),
  'draft-unreadable': () => t('schedule.admin.blocker.draft-unreadable'),
  'round-in-use': () => t('schedule.admin.blocker.round-in-use'),
} as const;

function pick<T extends Record<string, () => string>>(
  table: T,
  word: string | undefined,
): (() => string) | undefined {
  return word !== undefined && Object.hasOwn(table, word) ? table[word] : undefined;
}

/** The sentence the address asks for, or nothing when it asks for none we know. */
export function noticeOf(search: Search): Notice | undefined {
  const text = pick(done, first(search['done']));
  if (text !== undefined) return { kind: 'done', text: text() };
  const blocker = pick(blockers, first(search['blocker']));
  if (blocker !== undefined) return { kind: 'problem', text: blocker() };
  const problem = pick(problems, first(search['problem']));
  if (problem === undefined) return undefined;
  const reason = pick(reasons, first(search['reason']));
  const why = reason === undefined ? problem() : `${problem()} ${reason()}`;
  const key =
    first(search['partial']) === '1' ? 'schedule.admin.problemPartial' : 'schedule.admin.problem';
  return { kind: 'problem', text: t(key, { reason: why }) };
}

/**
 * The one sentence that says why a form beside it was refused (step 2.160): the rule's
 * own words when a rule refused it, else the refusal's; undefined when the address names
 * no refusal we know. Said beside the form, so "That was not saved" goes without saying.
 */
export function whyNotSaved(search: Search): string | undefined {
  const problem = pick(problems, first(search['problem']));
  if (problem === undefined) return undefined;
  const reason = pick(reasons, first(search['reason']));
  return reason === undefined ? problem() : reason();
}

/** The boxes of a game's form, by their names. */
export type GameField =
  | 'homeTeamId'
  | 'awayTeamId'
  | 'roundId'
  | 'date'
  | 'time'
  | 'place'
  | 'recording';

const gameFieldLabels: Readonly<Record<GameField, TextKey>> = {
  homeTeamId: 'schedule.admin.home',
  awayTeamId: 'schedule.admin.away',
  roundId: 'schedule.admin.roundField',
  date: 'schedule.admin.date',
  time: 'schedule.admin.time',
  place: 'schedule.admin.place',
  recording: 'schedule.admin.recording',
};

/** The box a refusal of a game's form is about; 'form' when it is about no one box. */
function gameFieldOf(search: Search, typed: GameTyped, adding: boolean): GameField | 'form' {
  const problem = first(search['problem']);
  const reason = first(search['reason']);
  const typing = problem === 'invalid-input';
  if (first(search['partial']) === '1') return 'recording';
  if (reason === 'invalid-date' || reason === 'date-out-of-range') return 'date';
  if (typing && typed.date === '') return 'date';
  if (reason === 'invalid-time' || problem === 'game-without-time') return 'time';
  if (adding && typing && typed.homeTeamId === '') return 'homeTeamId';
  if (adding && typing && typed.awayTeamId === '') return 'awayTeamId';
  if (adding && (reason === 'team-plays-itself' || reason === 'game-exists')) return 'awayTeamId';
  if (problem === 'unknown-venue' || problem === 'unknown-court') return 'place';
  if (!adding && reason === 'unknown-round') return 'roundId';
  return 'form';
}

/**
 * Which box of a game's form (its own, or "Add a game") a refusal belongs beside, and the
 * sentence said there, naming the box (step 2.155); undefined when the address names no
 * refusal we know.
 */
export function gameProblemOf(
  search: Search,
  typed: GameTyped,
  adding: boolean,
):
  | { readonly field: GameField | 'form'; readonly text: string; readonly changed?: true }
  | undefined {
  const why = whyNotSaved(search);
  if (why === undefined) return undefined;
  // Someone else changed the draft meanwhile (T-399): said at the top of the game's form,
  // and beside each box what is saved now where it differs from what was typed.
  if (!adding && first(search['problem']) === 'changed-since-read') {
    return { field: 'form', text: t('schedule.admin.gameChangedMeanwhile'), changed: true };
  }
  const field = gameFieldOf(search, typed, adding);
  if (field === 'form') return { field, text: why };
  return {
    field,
    text: t('schedule.admin.fieldRefused', { field: t(gameFieldLabels[field]), why }),
  };
}

/** Which field of "Add a round" a refusal belongs beside, and the sentence to say there. */
export function addRoundProblemOf(
  search: Search,
  typed: { readonly label: string; readonly date: string },
): { readonly field: 'label' | 'date' | 'form'; readonly text: string } | undefined {
  const problem = first(search['problem']);
  const reason = first(search['reason']);
  if (problem === undefined) return undefined;
  if (reason === 'empty-round-label' || (problem === 'invalid-input' && typed.label === '')) {
    return { field: 'label', text: t('schedule.admin.addRoundError.name') };
  }
  if (reason === 'invalid-date' || (problem === 'invalid-input' && typed.date === '')) {
    return { field: 'date', text: t('schedule.admin.addRoundError.date') };
  }
  if (reason === 'date-out-of-range') {
    const why = pick(reasons, reason);
    return why === undefined ? undefined : { field: 'date', text: why() };
  }
  const why = whyNotSaved(search);
  return why === undefined ? undefined : { field: 'form', text: why };
}
