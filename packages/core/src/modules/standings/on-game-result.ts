// Standings and season totals follow every result (T3 §9, T6 §7, T-24): when a game
// is decided or reopened, its season is worked out again in the same transaction as
// the result, so either both are saved or neither is. The games module does not know
// this module exists.
import { onEvent, type EventHandler } from '../../command/index.ts';
import {
  gameFinalized,
  gameReopened,
  type GameFinalized,
  type GameReopened,
} from '../../events/game-events.ts';
import type { StandingsTx } from './ports.ts';
import { clearPagesOnGameFinalized, clearPagesOnGameReopened } from './clear-page-cache.ts';
import { rebuildSeason } from './rebuild-season.ts';

export const rebuildOnGameFinalized = onEvent<GameFinalized, StandingsTx>(
  gameFinalized,
  async (event, tx) => {
    await rebuildSeason(tx, event.seasonId);
  },
);

export const rebuildOnGameReopened = onEvent<GameReopened, StandingsTx>(
  gameReopened,
  async (event, tx) => {
    await rebuildSeason(tx, event.seasonId);
  },
);

/**
 * The standings module's handlers, for the apps' list (core's eventHandlers): the season is
 * worked out again, then its pages' cache labels are queued to be cleared (step 2.26).
 */
export const standingsHandlers: readonly EventHandler<StandingsTx>[] = [
  rebuildOnGameFinalized,
  rebuildOnGameReopened,
  clearPagesOnGameFinalized,
  clearPagesOnGameReopened,
];
