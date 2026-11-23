// The team names the games list shows (step 2.56): a team in the bin keeps its name, with
// "(removed)" after it, so an admin reading one of its games knows it is gone. The words
// are in the message files (T-187).
import type { GameNames } from '../../server/games-area-ports.ts';
import { t } from '../../server/messages.ts';

/** The names, each team in the bin marked as removed. */
export function shownTeamNames(names: GameNames): GameNames {
  const removed = new Set(names.removedTeams);
  return {
    ...names,
    teams: Object.fromEntries(
      Object.entries(names.teams).map(([id, name]) => [
        id,
        removed.has(id) ? t('admin.games.removedTeam', { name }) : name,
      ]),
    ),
  };
}
