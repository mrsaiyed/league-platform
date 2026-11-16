// What the "Remove this team" panel says (A-17): first what the team has of games, then,
// after a refusal, why it stays and the way on. The counts are read again as the page is
// drawn, never carried in the address, so they are what the team has now.
import type { TeamGames } from '@srleagues/core';
import { t, type TextKey } from '../../server/messages.ts';
import { problemKey, removeTeamCommand } from './answer.ts';

/** "Badgers have played 4 games and have 3 still to play."; undefined counts could not be read. */
export function gamesLine(name: string, games: TeamGames | undefined): string {
  if (games === undefined) return t('adminTeams.remove.gamesUnknown');
  const played = t.plural('adminTeams.remove.gamesCount', games.played);
  if (games.played === 0 && games.toPlay === 0) return t('adminTeams.remove.gamesNone', { name });
  if (games.played === 0) {
    return t('adminTeams.remove.gamesNotPlayed', { name, toPlay: games.toPlay });
  }
  if (games.toPlay === 0) return t('adminTeams.remove.gamesNoneToPlay', { name, played });
  return t('adminTeams.remove.games', { name, played, toPlay: games.toPlay });
}

/** Where a refusal leads: Admin → Schedule, Admin → Games, or nowhere. */
export type RemoveWayOn = 'schedule' | 'games' | null;

/**
 * Why the team stayed, for a refusal's code, and the way on: its games to come are
 * removed in Schedule, or recorded as forfeited in Games (A-17). A count that has since
 * gone to nothing, or any other refusal, is said in the refusal's own general words.
 */
export function refusalWords(
  name: string,
  code: string,
  games: TeamGames | undefined,
): { readonly text: string; readonly wayOn: RemoveWayOn } {
  if (code === 'team-has-results' && games !== undefined && games.played > 0) {
    return {
      text: t.plural('adminTeams.remove.hasResults', games.played, { name }),
      wayOn: games.toPlay > 0 ? 'games' : null,
    };
  }
  if (code === 'team-has-games-to-play' && games !== undefined && games.toPlay > 0) {
    return {
      text: t.plural('adminTeams.remove.hasGamesToPlay', games.toPlay, { name }),
      wayOn: 'schedule',
    };
  }
  const key: TextKey =
    problemKey({ problem: `${removeTeamCommand}.${code}` }) ?? ('error.unknown' as TextKey);
  return { text: t(key), wayOn: null };
}
