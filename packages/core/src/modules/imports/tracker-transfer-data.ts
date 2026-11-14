// What the Al-Hadi transfer (step 2.58, F-7) works from: the games the current live
// tracker recorded, as packages/database reads them from a backup (step 2.57), and what
// the platform already holds for the chosen season. The tracker's shapes are written
// here again, not imported, because core never depends on packages/database (T-21); the
// reader's objects fit them as they are.
import type { SeasonRules } from '@srleagues/contracts';
import type { LiveGameLine } from '../games/index.ts';

/** A team in the tracker: the one it keeps records for (`tracked`) or an opponent. */
export type TrackerTeam = {
  readonly id: string;
  readonly name: string;
  readonly school: string;
  readonly tracked: boolean;
};

/** A player of a tracker team. `jersey` is '' when the player has no number. */
export type TrackerPlayer = {
  readonly id: string;
  readonly teamId: string;
  readonly name: string;
  readonly jersey: string;
  readonly active: boolean;
};

/** One action the tracker accepted, exactly as it stored it. */
export type TrackerEvent = {
  readonly seq: number;
  readonly commandId: string;
  /** `{ at, input }` as the tracker stores it (or, in older rows, the input alone). */
  readonly command: unknown;
  /** ISO 8601: when the tracker's server took it. */
  readonly acceptedAt: string;
};

/** One player's box score line in one game, as the tracker last saved it. */
export type TrackerLine = {
  readonly playerId: string;
  readonly teamId: string;
  readonly jersey: string;
  readonly appeared: boolean;
  readonly points: number;
  readonly fg1: number;
  readonly fg2: number;
  readonly fg3: number;
  readonly fouls: number;
  readonly turnovers: number;
  /** Time on court in milliseconds. */
  readonly ms: number;
};

export type TrackerGame = {
  readonly id: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  /** ISO 8601, or null when the game has no date. */
  readonly startsAt: string | null;
  /** Where the fixture came from, such as the league's game number. */
  readonly sourceRef: string | null;
  readonly status: 'scheduled' | 'live' | 'final';
  readonly homeScore: number;
  readonly awayScore: number;
  /** The tracker engine's last state, exactly as stored. */
  readonly state: unknown;
  readonly events: readonly TrackerEvent[];
  readonly lines: readonly TrackerLine[];
};

/** Everything read from a tracker backup. */
export type TrackerData = {
  readonly teams: readonly TrackerTeam[];
  readonly players: readonly TrackerPlayer[];
  readonly games: readonly TrackerGame[];
};

/** A team of the season, by name. */
export type SeasonTeamFact = { readonly id: string; readonly name: string };

/** A game of the season's published schedule. */
export type SeasonGameFact = {
  readonly id: string;
  /** The league's own number for the game, if it has one. */
  readonly number: number | null;
  /** The day it is played in the league's time zone (YYYY-MM-DD), or null. */
  readonly localDate: string | null;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly status: string;
};

/** Someone on a team's roster, with the name of their person. */
export type RosterPersonFact = {
  readonly personId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly publicName: string | null;
  readonly jerseyNumber: string | null;
};

/** Where one platform game stands, for the commands the transfer would send it. */
export type PlatformGameFact = {
  readonly status: string;
  readonly version: number;
  /** Whether the game has a saved tracker state (some play recorded here). */
  readonly tracked: boolean;
  /** Of the command ids asked about, those the game has already taken. */
  readonly taken: ReadonlySet<string>;
  /** The rules the game is played under (its own, or its season's). */
  readonly rules: SeasonRules;
};

/**
 * What the transfer reads from the platform, for one league and season. packages/database
 * supplies it, bound to the league (T-28).
 */
export type TrackerTransferReads = {
  /** The league's time zone, which days of games are judged in. */
  readonly timeZone: string;
  readonly teams: readonly SeasonTeamFact[];
  readonly games: readonly SeasonGameFact[];
  /** The roster of a team of the season, those who have left included. */
  readonly roster: (teamId: string) => Promise<readonly RosterPersonFact[]>;
  /** A game's standing, with which of these command ids it has taken. */
  readonly game: (
    gameId: string,
    commandIds: readonly string[],
  ) => Promise<PlatformGameFact | undefined>;
  /** A game's box score lines as saved now. */
  readonly lines: (gameId: string) => Promise<readonly LiveGameLine[]>;
};
