// What the games area's address says after a tap (step 2.154): which game's score boxes
// are open and with what typed, the question before a final score is saved, and what was
// just done or refused, and to which game, so the page says it beside that game. The
// forms send the browser here; nothing in the address is trusted beyond choosing what to
// draw: a final score is saved only by the question's own form, and its command checks
// everything again.
import { isGameAction, type GameAction } from './run-game-action.ts';

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** A score as typed: a whole number from 0 to 999, as text. */
export type TypedScores = { readonly homeScore: string; readonly awayScore: string };

export type GamesSearch = {
  /** What was just done; `reopen` comes back from the game's reopen form. */
  readonly done?: GameAction | 'reopen';
  /** Why the last change was refused: a command's error code. */
  readonly problem?: string;
  /** The game the last change was about. */
  readonly game?: string;
  /** The game whose score boxes are open, with what was typed in them. */
  readonly enter?: { readonly gameId: string; readonly typed?: TypedScores };
  /** The question before a final score is saved: the game as it was read, and the score. */
  readonly ask?: { readonly gameId: string; readonly version: number } & TypedScores;
};

const gameIdShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scoreShape = /^\d{1,3}$/;
const versionShape = /^\d{1,9}$/;

const first = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

/** A game id as the forms send it, lower case; undefined when it is not one. */
export function gameIdOf(text: string | undefined): string | undefined {
  const trimmed = (text ?? '').trim();
  return gameIdShape.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

/** Two typed scores, each a whole number from 0 to 999; undefined when either is not. */
export function typedScoresOf(
  home: string | undefined,
  away: string | undefined,
): TypedScores | undefined {
  const [homeScore, awayScore] = [(home ?? '').trim(), (away ?? '').trim()];
  return scoreShape.test(homeScore) && scoreShape.test(awayScore)
    ? { homeScore: String(Number(homeScore)), awayScore: String(Number(awayScore)) }
    : undefined;
}

export function readGamesSearch(search: SearchParams): GamesSearch {
  const done = first(search['done']);
  const problem = first(search['problem']);
  const game = gameIdOf(first(search['game']));
  const typed = typedScoresOf(first(search['home']), first(search['away']));
  const enterId = gameIdOf(first(search['enter']));
  const askId = gameIdOf(first(search['ask']));
  const version = first(search['v']) ?? '';
  return {
    ...(isGameAction(done) || done === 'reopen' ? { done } : {}),
    ...(problem !== undefined && /^[a-z-]{1,60}$/.test(problem) ? { problem } : {}),
    ...(game === undefined ? {} : { game }),
    ...(enterId === undefined
      ? {}
      : { enter: { gameId: enterId, ...(typed === undefined ? {} : { typed }) } }),
    ...(askId === undefined || typed === undefined || !versionShape.test(version)
      ? {}
      : { ask: { gameId: askId, version: Number(version), ...typed } }),
  };
}

/** The id a game's place on the list carries, so an address can lead straight to it. */
export const gameAnchor = (gameId: string) => `game-${gameId}`;

/**
 * The query and place to send the browser back to after a tap: these values, and the
 * game's place on the list, so the answer is on the screen beside the game.
 */
export function gamesReturn(values: Readonly<Record<string, string>>, gameId?: string): string {
  const query = new URLSearchParams(values).toString();
  return `${query === '' ? '' : `?${query}`}${gameId === undefined ? '' : `#${gameAnchor(gameId)}`}`;
}
