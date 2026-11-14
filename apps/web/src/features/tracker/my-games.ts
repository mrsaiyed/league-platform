// Who gets the scorekeeper's admin, and which of their games it offers to open in the
// tracker (P4 §4, P7 §5.1). Used by my-games-page.tsx and the tracker's page.
import { readOnlyLeagueStatuses, type AdminArea, type MyGame } from '@srleagues/core';

/** Whether someone uses the admin only to score: Games is the one area open to them. */
export function scoresOnly(areas: readonly AdminArea[]): boolean {
  return areas.length === 1 && areas[0] === 'games';
}

/**
 * The tracker opens a game recorded live that is to be played or being played, in a
 * league that may score. A game recorded as a final score or a box score is entered in
 * the games area instead.
 */
export function opensInTracker(game: Pick<MyGame, 'status' | 'scorable' | 'recording'>): boolean {
  return (
    game.scorable &&
    game.recording === 'live' &&
    (game.status === 'scheduled' || game.status === 'live')
  );
}

/**
 * How a game is recorded when its score is entered in the games area rather than in the
 * tracker: a game recorded as a final score or a box score that is to be played or being
 * played, in a league that may score. Null for any other game. A scorekeeper may enter
 * it (games.record_final_score and the box score need only games.score).
 */
export function entersScoreInGames(
  game: Pick<MyGame, 'status' | 'scorable' | 'recording'>,
): 'final-score' | 'box-score' | null {
  if (!game.scorable || (game.status !== 'scheduled' && game.status !== 'live')) return null;
  return game.recording === 'final-score' || game.recording === 'box-score' ? game.recording : null;
}

/**
 * The scorekeeper's games in game-night order (step 2.33), so tonight's game is on the
 * first screen of a phone: games being played now, then today's games still to play,
 * then the days ahead, and last the games that will not be played as listed (final,
 * forfeited, postponed or cancelled). Within each, the list's own order (soonest first).
 */
export function gameNightOrder<G extends Pick<MyGame, 'status' | 'isToday'>>(
  games: readonly G[],
): readonly G[] {
  const rank = (game: G): number => {
    if (game.status === 'live') return 0;
    if (game.status !== 'scheduled') return 3;
    return game.isToday ? 1 : 2;
  };
  return games
    .map((game, index) => ({ game, index }))
    .sort((a, b) => rank(a.game) - rank(b.game) || a.index - b.index)
    .map(({ game }) => game);
}

/**
 * Whether games may be scored in a league in this state: not while it is archived or
 * suspended (U-9). Its games are then shown, as on the games list, but not scored.
 */
export function leagueScores(status: string): boolean {
  return !readOnlyLeagueStatuses.includes(status);
}

/**
 * Why games are not scored in a league in this state, to say which (U-9): archived or
 * suspended. Null for a league that scores.
 */
export function notScoredBecause(status: string): 'archived' | 'suspended' | null {
  if (leagueScores(status)) return null;
  return status === 'suspended' ? 'suspended' : 'archived';
}
