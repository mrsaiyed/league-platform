// The games module's live game storage (core's LiveGamesStore, step 2.29), bound to one
// league scope.
import type { LiveGamesStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findSavedGameState,
  insertGameEvents,
  listGamePlayers,
  listTakenCommands,
  lockLiveGame,
  saveGameLines,
  saveGameState,
} from '../queries/index.ts';

export function liveGamesStore(scope: LeagueScope): LiveGamesStore {
  return {
    lock: (gameId) => lockLiveGame(scope, gameId),
    findState: (gameId) => findSavedGameState(scope, gameId),
    takenCommands: (gameId, commandIds) => listTakenCommands(scope, gameId, commandIds),
    addEvents: (events) => insertGameEvents(scope, events),
    saveState: (gameId, seq, state) => saveGameState(scope, gameId, seq, state),
    players: (gameId) => listGamePlayers(scope, gameId),
    saveLines: (gameId, lines, removed) => saveGameLines(scope, gameId, lines, removed),
  };
}
