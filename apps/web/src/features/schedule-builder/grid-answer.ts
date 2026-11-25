// How a schedule button's answer travels back to the grid (step 2.160; never the address
// since step 2.155 part 6, T-434): beyond the fixed words notice.ts turns into text, what
// was saved (a round, a game, the place of a removed one), so the grid says "Saved" beside
// it and the anchor takes the phone there; and, for a refused round or game form, which
// form it was and what was typed in it, so the form opens again with it kept and the reason
// beside it. All of it is the server's one-time notice (server/saved-notice.ts) for the
// person who sent it: the grid takes it once as it is drawn, so a reload, or Back to the
// page, says nothing old, and an address with the old words in it says nothing. Ids must be
// ids, and typed text is only ever put back into its own field, never shown as text (T-187).
//
// A game removed, put back or already back has a notice of its own shape (record 067, step
// 2.185): the game's id, what was done and the round it was in.
import { gameAnchor, type ScheduleDraftView } from '@srleagues/core';
import type { SavedNotice } from '../../server/saved-notice.ts';
import type {
  GameTyped,
  RefusedAt,
  SavedDetail,
  ScheduleActionOutcome,
} from './run-schedule-action.ts';

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
/** A game's "Swap with" form. */
export const swapAnchor = (gameId: string): string => `swap-${gameId}`;
/** A round's "Add a game" ('': the one under "Games with no round"). */
export const addGameAnchor = (roundId: string): string =>
  `add-game-${roundId === '' ? 'none' : roundId}`;

// The words an answer is written in: what it was, which form, and what was typed in it.
// None is ever read from the address; only these are read back from a notice.
const answerWords = [
  'done',
  'saved',
  'already',
  'removed',
  'after',
  'problem',
  'reason',
  'partial',
  'blocker',
  'at',
  'game',
  'other',
  'round',
  'label',
  'home',
  'away',
  'in',
  'date',
  'time',
  'place',
  'recording',
];

/** What an answer that is not a game's own notice leaves as `said`: its words, `?`-led. */
export function answerSaid(outcome: ScheduleActionOutcome): string {
  return `?${new URLSearchParams(answerParams(outcome).query).toString()}`;
}

/**
 * The address as the grid reads it: its own words (the season, the team it came from), never
 * an answer's, with the answer words of the notice the grid took for this page (`thing`, the
 * schedule's own address), if it took one.
 */
export function answerShown(search: Search, notice: GridNotice | undefined, thing: string): Search {
  const own = Object.fromEntries(
    Object.entries(search).filter(([name]) => !answerWords.includes(name)),
  );
  if (notice === undefined || notice.thing !== thing || !notice.said.startsWith('?')) return own;
  const said = [...new URLSearchParams(notice.said.slice(1))].filter(([name]) =>
    answerWords.includes(name),
  );
  return { ...own, ...Object.fromEntries(said) };
}

/**
 * Whether a kept answer to a button pressed again is still the truth (server/same-request.ts),
 * read against the draft as it is now: a round said added or saved is still in it, a game
 * still on it, a game said put back still there and one removed still gone, a publish or a
 * discard has no draft since. Otherwise the button runs again and its command answers as
 * things are now. A kept refusal holds: it is run again only when something typed changed.
 */
export function gridAnswerHolds(
  outcome: ScheduleActionOutcome,
  now: Pick<ScheduleDraftView, 'draft' | 'result'>,
): boolean {
  if (outcome.kind === 'refused') return true;
  if (outcome.kind === 'published' || outcome.kind === 'discarded') return now.draft === null;
  if (now.draft === null) return false;
  const detail = outcome.detail;
  if (detail === undefined) return false;
  const hasGame = (id: string | undefined) => now.result.games.some((g) => g.id === id);
  switch (detail.what) {
    case 'round-added':
    case 'round-saved':
      return now.result.rounds.some((r) => r.id === detail.roundId);
    case 'game-saved':
    case 'game-round':
    case 'game-put-back':
    case 'game-already-back':
      return hasGame(detail.gameId);
    case 'game-removed':
      return detail.gameId !== undefined && !hasGame(detail.gameId);
    case 'round-removed':
      return false;
  }
}

const timeShape = /^\d{2}:\d{2}$/;
const recordingShape = /^[a-z-]{1,40}$/;

/** A game form's boxes as they ride in the notice: ids, a date, a time, a place, a word. */
function typedQuery(typed: GameTyped): Record<string, string> {
  return {
    home: typed.homeTeamId,
    away: typed.awayTeamId,
    in: typed.roundId,
    date: typed.date.slice(0, 10),
    time: typed.time.slice(0, 5),
    place: typed.place.slice(0, 120),
    recording: typed.recording.slice(0, 40),
  };
}

function gameTypedOf(search: Search): GameTyped {
  const date = first(search['date']) ?? '';
  const time = first(search['time']) ?? '';
  const recording = first(search['recording']) ?? '';
  return {
    homeTeamId: idOf(first(search['home'])) ?? '',
    awayTeamId: idOf(first(search['away'])) ?? '',
    roundId: idOf(first(search['in'])) ?? '',
    date: dateShape.test(date) ? date : '',
    time: timeShape.test(time) ? time : '',
    place: (first(search['place']) ?? '').slice(0, 120),
    recording: recordingShape.test(recording) ? recording : '',
  };
}

/** An answer's words and the grid's anchor for it (the words go in the notice, answerSaid). */
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
    if (at.form === 'game') {
      return {
        query: { ...query, at: 'game', game: at.gameId, ...typedQuery(at.typed) },
        hash: `#${gameAnchor(at.gameId)}`,
      };
    }
    if (at.form === 'swap') {
      return {
        query: { ...query, at: 'swap', game: at.gameId, other: at.otherGameId },
        hash: `#${swapAnchor(at.gameId)}`,
      };
    }
    if (at.form === 'add-game') {
      return {
        query: { ...query, at: 'add-game', ...typedQuery(at.typed) },
        hash: `#${addGameAnchor(at.typed.roundId)}`,
      };
    }
    if (at.form === 'round') {
      return {
        query: {
          ...query,
          at: 'round',
          round: at.roundId,
          ...(at.label === undefined ? {} : { label: at.label.slice(0, 120) }),
          ...(at.date === undefined ? {} : { date: at.date.slice(0, 10) }),
        },
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
  const query: Record<string, string> = {
    done: outcome.kind,
    ...(outcome.kind === 'published' && outcome.already === true ? { already: '1' } : {}),
  };
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
      // Said by the game's own notice (noticeOfAnswer); the anchor is only the place:
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
 * since. Undefined for every other answer, whose words the notice holds (answerSaid).
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

/** What a save the answer's words name did, if they name one we know (answerShown). */
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
    // A removal or a put back is read only from its own notice (step 2.185).
    default:
      return undefined;
  }
}

/** The form a refusal belongs beside, with what was typed in it, if the answer names one. */
export function refusedAtOf(search: Search): RefusedAt | undefined {
  if (first(search['problem']) === undefined) return undefined;
  const at = first(search['at']);
  if (at === 'add-game') return { form: 'add-game', typed: gameTypedOf(search) };
  if (at === 'game') {
    const gameId = idOf(first(search['game']));
    return gameId === undefined ? undefined : { form: 'game', gameId, typed: gameTypedOf(search) };
  }
  if (at === 'swap') {
    const gameId = idOf(first(search['game']));
    if (gameId === undefined) return undefined;
    return { form: 'swap', gameId, otherGameId: idOf(first(search['other'])) ?? '' };
  }
  if (at === 'round') {
    const roundId = idOf(first(search['round']));
    if (roundId === undefined) return undefined;
    const label = first(search['label']);
    const date = first(search['date']);
    return {
      form: 'round',
      roundId,
      ...(label === undefined ? {} : { label: label.slice(0, 120) }),
      ...(date === undefined ? {} : { date: dateShape.test(date) ? date : '' }),
    };
  }
  if (at === 'add-round') {
    const label = (first(search['label']) ?? '').slice(0, 120);
    const typedDate = first(search['date']) ?? '';
    return { form: 'add-round', label, date: dateShape.test(typedDate) ? typedDate : '' };
  }
  return undefined;
}
