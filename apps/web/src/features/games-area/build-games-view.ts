// What the games area draws for each game, worked out from what the commands and
// stores gave (no reading, no wording): who can do what to it, and what it shows.
import { allows, type AccessHolder, type MyGame } from '@srleagues/core';
import type { GameNames } from '../../server/games-area-ports.ts';

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
  /** The tracker is worth opening: the game is being played, or is scored live. */
  readonly trackerLink: boolean;
  /** A final score may be entered. */
  readonly canScore: boolean;
  /** Forfeit may be recorded. */
  readonly canForfeit: boolean;
  /** Postpone and cancel are offered (only before the game starts). */
  readonly canCallOff: boolean;
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
  names: GameNames,
  holder: AccessHolder | undefined,
): readonly GameRowView[] {
  return games.map((game) => {
    const status = statusOf(game.status);
    // A postponed game waits for a new date (P7 §5.6): it is scored or forfeited only once
    // the schedule has given it one and it is scheduled again.
    const open = status === 'scheduled' || status === 'live';
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
      trackerLink: status === 'live' || (status === 'scheduled' && game.recording === 'live'),
      canScore: game.scorable && open,
      canForfeit: game.scorable && mayChange && open,
      canCallOff: game.scorable && mayChange && status === 'scheduled',
    };
  });
}
