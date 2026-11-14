// T-115, T6 §4: what the device keeps of a game the scorekeeper has opened, beside the
// queue of taps (queue-storage.ts): the two teams' rosters with names and numbers, the
// engine's state as the server last gave it, and the game format the scorekeeper
// confirmed. The browser keeps it in its database storage
// (indexeddb-opened-game-storage.ts); tests keep it in memory
// (memory-opened-game-storage.ts). Both behave the same. It also keeps this device's
// own id for the scoring session (T-116), made once.
//
// Failures throw a QueueError with one of its fixed codes (queue-storage.ts), never a
// sentence (T-187): the tracker picks the words.
import { basketball } from '@srleagues/sports';
import type { ServerState } from './tracker-server.ts';

/** A player as the device keeps them: names and number only (R-16). */
export type DevicePlayer = {
  readonly personId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly jerseyNumber: string | null;
  /** The player has left the team since (R-17). */
  readonly left: boolean;
};

export type DeviceTeam = {
  readonly teamId: string;
  readonly name: string;
  readonly players: readonly DevicePlayer[];
};

/** The game's two teams as the device keeps them. */
export type DeviceRosters = { readonly home: DeviceTeam; readonly away: DeviceTeam };

/** The game format the scorekeeper is asked to confirm (P7 §1, §5.1). */
export type GameFormat = {
  readonly periods: basketball.Rules['periods'];
  readonly periodSeconds: number;
  readonly overtimeSeconds: number;
  readonly clockMode: basketball.ClockMode;
};

/** One opened game, as the device keeps it. */
export type OpenedGame = {
  readonly gameId: string;
  readonly leagueId: string;
  readonly rosters: DeviceRosters;
  /** When the rosters were stored (device time, ms). */
  readonly rostersSavedAt: number;
  /** The engine's state as the server last gave it; null until it has loaded. */
  readonly state: ServerState | null;
  /** The format the scorekeeper confirmed on this device; null until they have. */
  readonly confirmedFormat: GameFormat | null;
};

export interface OpenedGameStorage {
  /** The game as the device keeps it, or undefined if it was never opened here. */
  find(gameId: string): Promise<OpenedGame | undefined>;
  /**
   * Stores the game's rosters (opening the game), keeping its state and confirmed
   * format if the device has them already.
   */
  saveRosters(
    gameId: string,
    leagueId: string,
    rosters: DeviceRosters,
    savedAt: number,
  ): Promise<void>;
  /** Stores the state the server gave; ignored for a game whose rosters are not stored. */
  saveState(gameId: string, state: ServerState): Promise<void>;
  /** Stores the format confirmed; ignored for a game whose rosters are not stored. */
  confirmFormat(gameId: string, format: GameFormat): Promise<void>;
  /** This device's own id, made with `make` the first time and kept from then on. */
  deviceId(make: () => string): Promise<string>;
}

/** The format of a game's rules, as it is shown and confirmed. */
export function formatOf(rules: basketball.Rules): GameFormat {
  return {
    periods: rules.periods,
    periodSeconds: rules.periodSeconds,
    overtimeSeconds: rules.overtimeSeconds,
    // Absent means a stop clock, spelled out so the format the scorekeeper confirmed
    // compares equal to the same rules read again.
    clockMode: basketball.clockModeOf(rules),
  };
}

/** Whether the format confirmed on the device is the game's format now. */
export function sameFormat(a: GameFormat | null, b: GameFormat): boolean {
  return (
    a !== null &&
    a.periods === b.periods &&
    a.periodSeconds === b.periodSeconds &&
    a.overtimeSeconds === b.overtimeSeconds &&
    a.clockMode === b.clockMode
  );
}
