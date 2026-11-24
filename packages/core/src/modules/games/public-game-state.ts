// The one truth of a game in public (step 2.159; P7 §5.3, §5.5, §5.6, §8; S-11, S-47):
// what every public page says a game is, from the game's own facts and the league's clock.
// The game's page, the home page, the schedule and a team's page all ask this one function,
// so no two of them can tell a parent two different things about the same game.
//
// - upcoming: still to come, or with no date yet (there is no start to have passed).
// - awaiting-score: its start has passed (exactly now counts, T-382) with no result, in a
//   league that types scores in afterwards or for a game no one tracked. Never "upcoming".
// - live: under way on a tracker.
// - being-corrected: a decided game reopened (an admin's reopen or a scorekeeper's own):
//   the result as it stood before the reopen, read from that correction's `before` (S-47).
//   "Take back End game" before the result was sent writes no correction, so it is not this.
// - final, forfeit: decided, with the result and, for a final, the time it ended.
// - postponed, cancelled: as the game's own status says, its start passed or not.
import type { MarkResult } from './corrected-mark.ts';
import { isDecided } from './game-fields.ts';

export const publicGameStates = [
  'upcoming',
  'awaiting-score',
  'live',
  'being-corrected',
  'final',
  'forfeit',
  'postponed',
  'cancelled',
] as const;
export type PublicGameState = (typeof publicGameStates)[number];

export type PublicGameFacts = {
  /** The game's own status, as stored: scheduled, live, final, forfeit, postponed, cancelled. */
  readonly status: string;
  /** Its planned start; null when it has no time yet. */
  readonly startsAt: string | null;
  /** A game with a day but no time: that day in the league's zone (YYYY-MM-DD). */
  readonly localDate?: string | null | undefined;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  /** When a decided game ended; null when not known. */
  readonly finalizedAt: string | null;
  /**
   * The result an open reopen took back (the latest correction's `before`), while the game
   * is not decided again; null or undefined when no reopen is open (S-47).
   */
  readonly beingCorrected?: MarkResult | null | undefined;
};

/** Now, and today's date in the league's own zone (YYYY-MM-DD). */
export type PublicGameClock = { readonly now: string; readonly today: string };

export type PublicGameResult = {
  readonly home: number;
  readonly away: number;
  readonly decided: 'final' | 'forfeit';
};

export type PublicGameTruth = {
  readonly state: PublicGameState;
  /** The result the public is shown: the game's own, or as it stood while being corrected. */
  readonly result: PublicGameResult | null;
  /** When a decided game ended, for "Ended on …"; null otherwise or when not known. */
  readonly endedAt: string | null;
};

const resultOf = (r: MarkResult): PublicGameResult | null => {
  const status = r.status ?? '';
  if (!isDecided(status)) return null;
  if (typeof r.homeScore !== 'number' || typeof r.awayScore !== 'number') return null;
  return {
    home: r.homeScore,
    away: r.awayScore,
    decided: status === 'final' ? 'final' : 'forfeit',
  };
};

/** What a game is in public, and the result shown with it. */
export function publicGameState(game: PublicGameFacts, clock: PublicGameClock): PublicGameTruth {
  const none = { result: null, endedAt: null };
  if (isDecided(game.status)) {
    return {
      state: game.status === 'final' ? 'final' : 'forfeit',
      result: resultOf(game),
      endedAt: game.finalizedAt,
    };
  }
  if (game.status === 'postponed' || game.status === 'cancelled') {
    return { state: game.status, ...none };
  }
  const stood =
    game.beingCorrected === null || game.beingCorrected === undefined
      ? null
      : resultOf(game.beingCorrected);
  if (stood !== null) return { state: 'being-corrected', result: stood, endedAt: null };
  if (game.status === 'live') return { state: 'live', ...none };
  const started =
    game.startsAt !== null
      ? Date.parse(game.startsAt) <= Date.parse(clock.now)
      : game.localDate !== null && game.localDate !== undefined && game.localDate < clock.today;
  return { state: started ? 'awaiting-score' : 'upcoming', ...none };
}
