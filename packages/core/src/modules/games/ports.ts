// What the games module needs from storage. packages/database supplies it, bound to
// one transaction for one league, so none of these take a league id (T-28).
import type { SeasonRules } from '@srleagues/contracts';
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, ActivityLog } from '../access/index.ts';
import type { StoredSetting } from '../leagues/index.ts';

/** A game of a season, in or out of the bin (T3 §8). */
export type GameRecord = {
  readonly id: string;
  readonly seasonId: string;
  readonly divisionId: string | null;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly startsAt: string | null;
  /** scheduled, live, final, postponed, cancelled or forfeit. */
  readonly status: string;
  /** How the database spells it: final, box or live (see recordingOf). */
  readonly captureMode: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  /** The rules the game is played under; null while it follows its season's. */
  readonly format: unknown;
  readonly finalizedAt: string | null;
  readonly binned: boolean;
  readonly version: number;
};

/**
 * What a result change sets: the status and scores, whether the game now counts as
 * decided (the database stamps `finalized_at` itself), and the rules it is played
 * under when it has none yet.
 */
export type GameResultChange = {
  readonly status: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly decided: boolean;
  /** Set only if the game has none; a game that has rules keeps them. */
  readonly format?: SeasonRules;
};

/** A result as a correction keeps it: a versioned document of words and numbers only (T-220). */
export type GameResultDocument = {
  readonly version: 1;
  readonly status: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
};

/** One player's box score line in one game (T3 §8 `player_game_stats`). */
export type GameLine = {
  readonly gameId: string;
  readonly teamId: string;
  readonly personId: string;
  readonly played: boolean;
  /** Null when minutes were not recorded. */
  readonly secondsPlayed: number | null;
  /** Counts keyed by stat; a missing key means the stat was not recorded. */
  readonly stats: Readonly<Record<string, number>>;
};

/** One reopening, with numbers only, never names (T-220). */
export type NewGameCorrection = {
  readonly gameId: string;
  readonly accountId: string;
  readonly reason: string;
  readonly before: GameResultDocument;
  readonly after: GameResultDocument;
};

/** A game of the coming days, as the scorekeeper's list reads it (P4 §4). */
export type GameInWindow = {
  readonly game: GameRecord;
  /** The program of the game's season: where scoring it is checked. */
  readonly programId: string;
  /** The day it is played, in the league's time zone (YYYY-MM-DD). */
  readonly day: string;
  /** Whether the account asked about is assigned to score it. */
  readonly assigned: boolean;
};

/** The games from the start of the league's today, for a number of days. */
export type GamesWindow = {
  /** Today in the league's time zone (YYYY-MM-DD), by the database's clock. */
  readonly today: string;
  /** Games not in the bin with a start in the window, soonest first. */
  readonly games: readonly GameInWindow[];
};

export type GamesStore = {
  /** The game with this id, in the bin or not, or undefined if it is not in this league. */
  readonly find: (gameId: string) => Promise<GameRecord | undefined>;
  /**
   * Changes a game not in the bin if it is still at `version` (T-46): the new
   * version, or undefined if it is not there or moved on.
   */
  readonly setResult: (
    gameId: string,
    change: GameResultChange,
    version: number,
  ) => Promise<number | undefined>;
  /** Writes the correction row (S-7) in this transaction; the database needs it to change a decided game. */
  readonly addCorrection: (correction: NewGameCorrection) => Promise<void>;
  /** Postponed games not in the bin, soonest first, of one season or all. */
  readonly listPostponed: (seasonId?: string) => Promise<readonly GameRecord[]>;
  /** A season's decided games (final or forfeit) not in the bin, in id order. */
  readonly listDecided: (seasonId: string) => Promise<readonly GameRecord[]>;
  /** The box score lines of a season's decided games not in the bin, by game and person. */
  readonly listDecidedLines: (seasonId: string) => Promise<readonly GameLine[]>;
  /** The program a season belongs to and its rules as stored, or undefined if it is not here. */
  readonly findSeason: (
    seasonId: string,
  ) => Promise<{ readonly programId: string; readonly rules: unknown } | undefined>;
  /** The league's own stored values of one setting (the league level), as a lookup reads them. */
  readonly leagueSettingRows: (key: string) => Promise<readonly StoredSetting[]>;
  /** Whether the account is assigned to score the game (T3 §8 `game_assignments`). */
  readonly isAssigned: (gameId: string, accountId: string) => Promise<boolean>;
  /** Assigns the account to the game: false if it already was. */
  readonly assign: (gameId: string, accountId: string) => Promise<boolean>;
  /** Removes the account's assignment to the game: false if there was none. */
  readonly unassign: (gameId: string, accountId: string) => Promise<boolean>;
  /** The games of `days` days from the start of the league's today, with the account's assignments. */
  readonly listWindow: (accountId: string, days: number) => Promise<GamesWindow>;
};

/** A games command's transaction: its store, the access reader and the activity log (A-6). */
export type GamesTx = CommandTx & {
  readonly games: GamesStore;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};

/**
 * The server's clock: milliseconds since 1970. Leases (T-116) are worked out from it,
 * never from the device's clock; a test passes one it moves by hand.
 */
export type Clock = { readonly now: () => number };

/** The one device scoring a game (T3 §8 `scoring_sessions`, T-116). Times in milliseconds. */
export type ScoringSession = {
  readonly id: string;
  readonly gameId: string;
  readonly accountId: string;
  /** The device's own id for itself, made by the tracker. */
  readonly deviceId: string;
  /** When this session began: the `since` a takeover names. Never moves. */
  readonly since: number;
  /** When its lease runs out unless it is renewed. */
  readonly heldUntil: number;
};

export type NewScoringSession = Omit<ScoringSession, 'id'>;

export type ScoringSessionsStore = {
  /** The game's session, whether its lease has run out or not. */
  readonly findForGame: (gameId: string) => Promise<ScoringSession | undefined>;
  /**
   * Starts the game's session unless it already has one, even one another request
   * started a moment ago: the new session, or undefined. Never throws for that, so
   * the transaction stays usable to read who won.
   */
  readonly start: (session: NewScoringSession) => Promise<ScoringSession | undefined>;
  /** Moves the lease of the game's session `sessionId` on to `heldUntil`: false if it is gone. */
  readonly extend: (gameId: string, sessionId: string, heldUntil: number) => Promise<boolean>;
  /**
   * Ends the game's session `sessionId`. With `lapsedBy`, only if its lease had run out
   * by then, so a session renewed a moment ago is kept. False if nothing was ended.
   */
  readonly end: (gameId: string, sessionId: string, lapsedBy?: number) => Promise<boolean>;
};

/** The scoring session commands' transaction: the games one, the sessions and the clock. */
export type ScoringTx = GamesTx & {
  readonly scoringSessions: ScoringSessionsStore;
  readonly clock: Clock;
};

/** A game's saved engine state (T3 §8 `game_states`): the last event it applied, and the document. */
export type SavedGameState = { readonly seq: number; readonly state: unknown };

/** One tap the server took (T3 §8 `game_events`): the engine's command split into its type and the rest. */
export type NewGameEvent = {
  readonly gameId: string;
  /** Its place in the game: 1, 2, 3 with no gaps. */
  readonly seq: number;
  readonly commandId: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  /** When it counts as tapped (ms): the device's time, never later than the server's. */
  readonly tappedAt: number;
  /** Who scored it. */
  readonly accountId: string;
};

/** Someone who may appear in a game's box score: a player on one of its two teams' rosters. */
export type GamePlayer = {
  readonly personId: string;
  readonly teamId: string;
  /** The number they wear, from their roster entry; null if they have none. */
  readonly jerseyNumber: string | null;
};

/** A box score line as the live game writes it: a line with the number worn in this game. */
export type LiveGameLine = GameLine & { readonly jerseyNumber: string | null };

/** The live game's storage (T3 §8, T6 §1): its lock, state, events and box score lines. */
export type LiveGamesStore = {
  /**
   * Holds this one game until the transaction ends (T-111): another batch for it waits
   * here, while batches for every other game go on (T-112). False if the game is not
   * in this league.
   */
  readonly lock: (gameId: string) => Promise<boolean>;
  readonly findState: (gameId: string) => Promise<SavedGameState | undefined>;
  /** Of these command ids, the ones the game has already taken (T3 §12). */
  readonly takenCommands: (
    gameId: string,
    commandIds: readonly string[],
  ) => Promise<readonly string[]>;
  readonly addEvents: (events: readonly NewGameEvent[]) => Promise<void>;
  /** Writes the game's state as of event `seq`: the first time, or over the last one. */
  readonly saveState: (gameId: string, seq: number, state: unknown) => Promise<void>;
  /** The players of the game's two teams, as their rosters have them. */
  readonly players: (gameId: string) => Promise<readonly GamePlayer[]>;
  /** Writes these lines, each added or replaced, and removes the lines of `removed` (person ids). */
  readonly saveLines: (
    gameId: string,
    lines: readonly LiveGameLine[],
    removed: readonly string[],
  ) => Promise<void>;
};

/** The tracker's commands' transaction (step 2.29): the scoring one and the live game. */
export type TrackerTx = ScoringTx & { readonly liveGames: LiveGamesStore };
