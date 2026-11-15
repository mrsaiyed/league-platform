// The games module's live game storage (core's LiveGamesStore, steps 2.29 and 2.30),
// bound to one league scope.
import type { LiveGamesStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findSavedGameState,
  findTablePlayer,
  insertGameEvents,
  insertTablePlayer,
  listGamePlayerLines,
  listGamePlayers,
  listTakenCommands,
  removeTablePlayer,
  renameTablePlayer,
  saveGameLines,
  saveGameState,
  setTablePlayerNumber,
} from '../queries/index.ts';

/** A line's stats as counts: the database keeps only whole numbers there (is_stat_counts). */
function countsOf(stats: unknown): Record<string, number> {
  if (typeof stats !== 'object' || stats === null) return {};
  return Object.fromEntries(
    Object.entries(stats).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}

export function liveGamesStore(scope: LeagueScope): LiveGamesStore {
  return {
    findState: (gameId) => findSavedGameState(scope, gameId),
    takenCommands: (gameId, commandIds) => listTakenCommands(scope, gameId, commandIds),
    addEvents: (events) => insertGameEvents(scope, events),
    saveState: (gameId, seq, state) => saveGameState(scope, gameId, seq, state),
    players: (gameId) => listGamePlayers(scope, gameId),
    lines: async (gameId) =>
      (await listGamePlayerLines(scope, gameId)).map((line) => ({
        ...line,
        gameId,
        stats: countsOf(line.stats),
      })),
    saveLines: (gameId, lines, removed) => saveGameLines(scope, gameId, lines, removed),
    // The players the scorer's table adds, changes and takes off (record 058).
    findTablePlayer: (teamId, personId) => findTablePlayer(scope, teamId, personId),
    addTablePlayer: (player) => insertTablePlayer(scope, player),
    setTablePlayerNumber: (entryId, jersey) => setTablePlayerNumber(scope, entryId, jersey),
    renameTablePlayer: (personId, first, last) => renameTablePlayer(scope, personId, first, last),
    removeTablePlayer: (entryId, personId) => removeTablePlayer(scope, entryId, personId),
  };
}
