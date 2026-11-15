// How a schedule button's answer travels back to the grid in its address (step 2.160),
// beyond the fixed words notice.ts turns into text: what was saved (a round, a game, the
// place of a removed one), so the grid says "Saved" beside it and the address's anchor
// takes the phone there; and, for a refused round form, which form it was and what was
// typed in it, so the form opens again with it kept and the reason beside it. Ids must be
// ids, and typed text is only ever put back into its own field, never shown as text (T-187).
import type {
  RefusedAt,
  RemovedGame,
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

/** The anchors: a round's section, a game's line, the "Add a round" form, a "Saved". */
export const roundAnchor = (roundId: string): string => `round-${roundId}`;
export const gameAnchor = (gameId: string): string => `game-${gameId}`;
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
    case 'game-removed': {
      const game = detail.game;
      return {
        query: {
          ...query,
          saved: detail.what,
          ...(detail.roundId === null ? {} : { round: detail.roundId }),
          // The game as it was, so "Put it back" can add it again (step 2.161).
          ...(game === undefined
            ? {}
            : {
                game: game.gameId,
                home: game.homeTeamId,
                away: game.awayTeamId,
                date: game.date.slice(0, 10),
                ...(game.time === null ? {} : { time: game.time.slice(0, 5) }),
                ...(game.place === '' ? {} : { place: game.place.slice(0, 200) }),
                ...(game.recording === null ? {} : { recording: game.recording.slice(0, 20) }),
              }),
        },
        hash,
      };
    }
    case 'game-saved':
    case 'game-round':
    case 'game-put-back':
      return { query: { ...query, saved: detail.what, game: detail.gameId }, hash };
  }
}

const timeShape = /^\d{2}:\d{2}$/;
const recordingShape = /^[a-z-]{1,20}$/;

/** The removed game the address carries, if every part of it is the shape it must be. */
function removedGameOf(search: Search, roundId: string | null): RemovedGame | undefined {
  const gameId = idOf(first(search['game']));
  const homeTeamId = idOf(first(search['home']));
  const awayTeamId = idOf(first(search['away']));
  const date = first(search['date']) ?? '';
  const time = first(search['time']);
  const recording = first(search['recording']);
  if (gameId === undefined || homeTeamId === undefined || awayTeamId === undefined) {
    return undefined;
  }
  if (!dateShape.test(date)) return undefined;
  if (time !== undefined && !timeShape.test(time)) return undefined;
  if (recording !== undefined && !recordingShape.test(recording)) return undefined;
  return {
    gameId,
    homeTeamId,
    awayTeamId,
    roundId,
    date,
    time: time ?? null,
    // A venue's id and a court's name, put back only into the form's own hidden field.
    place: (first(search['place']) ?? '').slice(0, 200),
    recording: recording ?? null,
  };
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
      const game = removedGameOf(search, roundId);
      return game === undefined ? { what, roundId } : { what, roundId, game };
    }
    case 'game-saved':
    case 'game-round':
    case 'game-put-back': {
      const gameId = idOf(first(search['game']));
      return gameId === undefined ? undefined : { what, gameId };
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
