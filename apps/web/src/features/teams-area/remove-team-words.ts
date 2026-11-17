// What the "Remove this team" panel says (A-17), from what the team has of games now, read
// as the page is drawn. A team that cannot go to the bin is told so up front, with why and
// the way on, and the panel draws no tick and no button: nothing there can only refuse. A
// refusal is never carried over from the address to be drawn again (record 067): what the
// panel says is what is true on this draw. A team with no games, or whose games could not
// be read, has the tick and the button, and the command still refuses what it must.
import type { GameWithoutResult, TeamGames } from '@srleagues/core';
import { leagueDayText } from '../../server/game-when.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import { problemKey, removeTeamCommand } from './answer.ts';

/** How many games without a result the panel names one by one (round and day). */
export const namedGamesAtMost = 3;

/** A way on from the panel: Schedule (its grid or its publish box), or Games. */
export type RemoveWayOn = {
  readonly area: 'schedule' | 'games';
  /** The place on the page it leads to: Schedule's publish box. */
  readonly anchor?: 'publish';
  readonly label: TextKey;
};

export type RemovePanel =
  /** May go to the bin: the line, then the tick and the button. */
  | { readonly kind: 'free'; readonly lines: readonly string[] }
  /** Cannot go to the bin, now or this season: why, what it has, the way on. */
  | {
      readonly kind: 'held';
      readonly why: string;
      readonly lines: readonly string[];
      readonly ways: readonly RemoveWayOn[];
    };

/** "Round 6, Sun, Nov 22", "Sun, Nov 22" for a game with no round, "no day yet". */
function gameText(game: GameWithoutResult): string {
  const day = game.date === null ? t('adminTeams.remove.noDay') : leagueDayText(game.date, locale);
  return game.round === null ? day : t('adminTeams.remove.roundDay', { round: game.round, day });
}

/** What the team has: "This team has played 3 games." and its games without a result. */
function hasLines(games: TeamGames): string[] {
  const played =
    games.played === 0
      ? t('adminTeams.remove.playedNone')
      : t.plural('adminTeams.remove.played', games.played);
  if (games.toPlay === 0) return [played, t('adminTeams.remove.openNone')];
  const open =
    games.toPlay <= namedGamesAtMost
      ? t.plural('adminTeams.remove.openWhich', games.toPlay, {
          which: games.which.map(gameText).join('; '),
        })
      : t.plural('adminTeams.remove.open', games.toPlay);
  const lines = [played, open];
  if (games.removedInDraft > 0) {
    lines.push(t.plural('adminTeams.remove.inDraft', games.removedInDraft));
  }
  return lines;
}

/** The panel for a team, by what it has of games; undefined games could not be read. */
export function removePanel(name: string, games: TeamGames | undefined): RemovePanel {
  if (games === undefined) return { kind: 'free', lines: [t('adminTeams.remove.gamesUnknown')] };
  const lines = hasLines(games);
  if (games.played === 0 && games.toPlay === 0) return { kind: 'free', lines };
  const publish: RemoveWayOn = {
    area: 'schedule',
    anchor: 'publish',
    label: 'adminTeams.remove.toPublish',
  };
  const schedule: RemoveWayOn = { area: 'schedule', label: 'adminTeams.remove.toSchedule' };
  const gamesArea: RemoveWayOn = { area: 'games', label: 'adminTeams.remove.toGames' };
  const draftOnly = games.removedInDraft > 0 && games.removedInDraft === games.toPlay;
  if (games.played > 0) {
    // Results hold the team for the season: forfeiting is advice for a team that has left,
    // never a way to remove it, and is not offered when it has no games to come.
    const advice = games.toPlay === 0 || draftOnly ? [] : [t('adminTeams.remove.leftAdvice')];
    return {
      kind: 'held',
      why: t('adminTeams.remove.cannot', { name }),
      lines: [...lines, ...advice],
      ways: games.toPlay === 0 ? [] : draftOnly ? [publish] : [gamesArea, schedule],
    };
  }
  // Only games without a result: removed in the draft and waiting for publishing, or still
  // to be removed or cancelled. Never forfeited: a forfeit is a result.
  return {
    kind: 'held',
    why: t('adminTeams.remove.notYet', { name }),
    lines: draftOnly ? lines : [...lines, t('adminTeams.remove.notYetWay')],
    ways: draftOnly
      ? [publish]
      : games.removedInDraft > 0
        ? [schedule, gamesArea, publish]
        : [schedule, gamesArea],
  };
}

/**
 * The words of a refusal of "Remove this team" carried in the address, for one the panel
 * does not already say as it stands now: not confirmed, not there. A refusal for games or
 * results is never drawn from the address: the panel says what is true now (record 067).
 */
export function tapRefusal(code: string): string | undefined {
  if (code === 'team-has-results' || code === 'team-has-games-to-play') return undefined;
  return t(problemKey({ problem: `${removeTeamCommand}.${code}` }) ?? 'error.unknown');
}
