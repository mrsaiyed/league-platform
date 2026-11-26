// The opened games kept in memory, for tests. It copies what goes in and what comes
// out, as the browser's storage does, so a test cannot pass by changing an object the
// storage still holds.
import {
  stillKept,
  withLineupPicks,
  withScoring,
  type OpenedGame,
  type OpenedGameStorage,
} from './opened-game-storage.ts';

export function createMemoryOpenedGameStorage(): OpenedGameStorage {
  const games = new Map<string, OpenedGame>();
  let device: string | null = null;

  const change = (gameId: string, edit: (game: OpenedGame) => OpenedGame) => {
    const found = games.get(gameId);
    if (found !== undefined) games.set(gameId, structuredClone(edit(found)));
  };

  return {
    async find(gameId) {
      const found = games.get(gameId);
      return found === undefined ? undefined : structuredClone(found);
    },
    async saveRosters(owner, rosters, savedAt) {
      const { gameId, leagueId, accountId } = owner;
      const found = games.get(gameId);
      games.set(
        gameId,
        structuredClone({
          gameId,
          leagueId,
          accountId,
          rosters,
          rostersSavedAt: savedAt,
          state: found?.state ?? null,
          confirmedFormat: found?.confirmedFormat ?? null,
          ...(found?.scoring === undefined ? {} : { scoring: found.scoring }),
          ...(found?.lineupPicks === undefined ? {} : { lineupPicks: found.lineupPicks }),
        }),
      );
    },
    async forgetOthers(owner, olderThan, withTaps) {
      for (const [gameId, game] of games) {
        if (!stillKept(game, owner, olderThan, withTaps)) games.delete(gameId);
      }
    },
    async forgetAll() {
      games.clear();
    },
    async forgetGame(gameId) {
      games.delete(gameId);
    },
    async saveState(gameId, state) {
      change(gameId, (game) => ({ ...game, state }));
    },
    async confirmFormat(gameId, format) {
      change(gameId, (game) => ({ ...game, confirmedFormat: format }));
    },
    async saveScoring(gameId, scoring) {
      change(gameId, (game) => withScoring(game, scoring));
    },
    async saveLineupPicks(gameId, picks) {
      change(gameId, (game) => withLineupPicks(game, picks));
    },
    async deviceId(make) {
      device ??= make();
      return device;
    },
  };
}
