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
  /** A final game's overtime periods (P7 §5.6), for its card's pill; null when none is known. */
  readonly overtimePeriods: number | null;
  readonly startsAt: string | null;
  readonly scorekeepers: readonly string[];
  /**
   * The live tracker has recorded plays of this game, still to be decided: it is ended in
   * the tracker, so it has no score boxes and no forfeit (S-46).
   */
  readonly hasPlays: boolean;
  /**
   * Plays are being recorded: a live game with plays, ended only in the tracker (S-46). A
   * game that is not live holds at most its line-ups (step 2.56): not this.
   */
  readonly playsRecorded: boolean;
  /** The tracker holds the line-ups of a game that has not started (step 2.56). */
  readonly lineupsSet: boolean;
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
  /** Postpone is offered: a scheduled game, before it starts (step 2.158: it asks first). */
  readonly canPostpone: boolean;
  /** Cancel is offered: a scheduled or a postponed game (step 2.158: it asks first). */
  readonly canCancel: boolean;
  /** "Put this game back" is offered: a cancelled game, to whoever may cancel it (S-51). */
  readonly canPutBack: boolean;
  /** "Put it back on its date" is offered: a postponed game, to whoever may postpone (S-75). */
  readonly canRestore: boolean;
  /** The score a forfeit would record, winner's and loser's (the forfeit's question says it). */
  readonly forfeitScore: { readonly winner: number; readonly loser: number };
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
    // A postponed game waits for a new date (P7 §5.6): it is scored only once it is played
    // then, but it may be forfeited (S-75, step 2.158). A game with plays is ended in the
    // tracker (S-46): no score typed by hand, no forfeit, no paper sheet.
    const open = (status === 'scheduled' || status === 'live') && !game.hasPlays;
    const mayChange = mayChangeResult(holder, game.programId);
    const callOff = game.scorable && mayChange && !game.inArchivedSeason;
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
      overtimePeriods: game.overtimePeriods,
      startsAt: game.startsAt,
      scorekeepers: names.scorekeepers[game.id] ?? [],
      hasPlays: game.hasPlays,
      playsRecorded: game.hasPlays && status === 'live',
      lineupsSet: game.hasPlays && status !== 'live',
      trackerLink: status === 'live' || (status === 'scheduled' && game.recording === 'live'),
      canScore: game.scorable && open,
      boxScoreLink:
        game.scorable &&
        ((status === 'scheduled' && !game.hasPlays) ||
          ((status === 'final' || status === 'forfeit') && game.recording === 'box-score')),
      // A game with only its line-ups set may be forfeited too (step 2.56): a team that
      // did not come after line-ups were set.
      canForfeit:
        game.scorable &&
        mayChange &&
        (open || status === 'postponed' || (status === 'scheduled' && game.hasPlays)),
      // A scheduled game that holds line-ups from a scorer's table (it has "plays" by the
      // store's rule, but is not live) may still be postponed or cancelled: its line-ups
      // are kept, and the question says so (step 2.158).
      // None of the four in an archived season, a correction open on the game or not: the
      // commands refuse them there (gameInArchivedSeason, O-12, T-390).
      canPostpone: callOff && status === 'scheduled',
      canCancel: callOff && (status === 'scheduled' || status === 'postponed'),
      canPutBack: callOff && status === 'cancelled',
      canRestore: callOff && status === 'postponed',
      forfeitScore: game.forfeitScore,
      reopen: game.scorable ? reopens.get(game.id) : undefined,
    };
  });
}
