// What the games area draws for each game, worked out from what the commands and
// stores gave (no reading, no wording): who can do what to it, and what it shows.
import { allows, type AccessHolder, type MyGame } from '@srleagues/core';
import type { GameNames } from '../../server/games-area-ports.ts';
import type { ReopenView } from './reopen-view.ts';

export type GameRowView = {
  readonly id: string;
  readonly version: number;
  readonly status: 'scheduled' | 'live' | 'final' | 'forfeit' | 'postponed' | 'cancelled';
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeName: string;
  readonly awayName: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly startsAt: string | null;
  readonly scorekeepers: readonly string[];
  /**
   * The live tracker has recorded plays of this game, still to be decided: it is ended in
   * the tracker, so it has no score boxes and no forfeit (S-46).
   */
  readonly hasPlays: boolean;
  /** The tracker is worth opening: the game is being played, or is scored live. */
  readonly trackerLink: boolean;
  /**
   * The box score grid is worth opening: to enter a sheet for a game not being
   * tracked, or to see and correct one entered as a box score (step 2.64).
   */
  readonly boxScoreLink: boolean;
  /** A final score may be entered. */
  readonly canScore: boolean;
  /** Forfeit may be recorded. */
  readonly canForfeit: boolean;
  /** Postpone and cancel are offered (only before the game starts). */
  readonly canCallOff: boolean;
  /** For a final or forfeited game: how it is put right, or who can (reopen-view.ts). */
  readonly reopen: ReopenView | undefined;
};

const knownStatuses = ['scheduled', 'live', 'final', 'forfeit', 'postponed', 'cancelled'] as const;
const statusOf = (status: string): GameRowView['status'] =>
  knownStatuses.find((s) => s === status) ?? 'scheduled';

/** Whether the holder may change results at this game's program; the command checks again. */
export function mayChangeResult(holder: AccessHolder | undefined, programId: string): boolean {
  return (
    holder !== undefined && allows(holder, 'games.results', { type: 'program', id: programId })
  );
}

export function buildGameRows(
  games: readonly MyGame[],
  names: Pick<GameNames, 'teams' | 'scorekeepers'>,
  holder: AccessHolder | undefined,
  reopens: ReadonlyMap<string, ReopenView> = new Map(),
): readonly GameRowView[] {
  return games.map((game) => {
    const status = statusOf(game.status);
    // A postponed game waits for a new date (P7 §5.6): it is scored or forfeited only once
    // the schedule has given it one and it is scheduled again. A game with plays is
    // ended in the tracker (S-46): no score typed by hand, no forfeit, no paper sheet.
    const open = (status === 'scheduled' || status === 'live') && !game.hasPlays;
    const mayChange = mayChangeResult(holder, game.programId);
    return {
      id: game.id,
      version: game.version,
      status,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeName: names.teams[game.homeTeamId] ?? '',
      awayName: names.teams[game.awayTeamId] ?? '',
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      startsAt: game.startsAt,
      scorekeepers: names.scorekeepers[game.id] ?? [],
      hasPlays: game.hasPlays,
      trackerLink: status === 'live' || (status === 'scheduled' && game.recording === 'live'),
      canScore: game.scorable && open,
      boxScoreLink:
        game.scorable &&
        ((status === 'scheduled' && !game.hasPlays) ||
          ((status === 'final' || status === 'forfeit') && game.recording === 'box-score')),
      canForfeit: game.scorable && mayChange && open,
      canCallOff: game.scorable && mayChange && status === 'scheduled',
      reopen: game.scorable ? reopens.get(game.id) : undefined,
    };
  });
}
