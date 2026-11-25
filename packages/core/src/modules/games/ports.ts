// What the games module needs from storage. packages/database supplies it, bound to
// one transaction for one league, so none of these take a league id (T-28).
import type { GameFormatRules, PlaySource, SeasonRules } from '@srleagues/contracts';
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, AccessStore, ActivityLog } from '../access/index.ts';
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
  /**
   * How many overtime periods a final game had (P7 §5.6): 0 when the tracker ended it in
   * regulation or a score typed in with "No overtime" (S-86). Null when it is not known: a
   * box score, a forfeit, a score typed in before step 2.56, a
   * game not final, a game final before the count was kept (migration 0021).
   */
  readonly overtimePeriods: number | null;
  /** The rules the game is played under; null while it follows its season's. */
  readonly format: unknown;
  readonly finalizedAt: string | null;
  readonly binned: boolean;
  readonly version: number;
  /**
   * True while an overturn (S-85) rules on this game's result: it is then not reopened,
   * corrected or moved to the bin until the overturn is taken off. Read by `find` only.
   */
  readonly overturned?: boolean;
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
  /**
   * The overtime periods of the result (P7 §5.6), written with every change of it: the
   * count the engine gives when the tracker ends the game, else null (not known, or not
   * final), so a game reopened, or decided again by hand, never keeps an old count.
   */
  readonly overtimePeriods: number | null;
  /** Set only if the game has none; a game that has rules keeps them. */
  readonly format?: SeasonRules;
  /** How the game is now recorded (final, box or live), when that changes with the result. */
  readonly captureMode?: 'final' | 'box' | 'live';
  /**
   * The account that decided it by hand (step 2.177, migration 0028), kept while the game
   * stays decided; left out or null for a tracker's end, or a change that undecides it.
   */
  readonly decidedBy?: string | null;
};

/** One game's facts for the scorekeeper's own reopening, read for a whole list (T-349). */
export type HandResultFacts = {
  readonly gameId: string;
  readonly status: string;
  /** The account that decided it by hand, or null. */
  readonly decidedBy: string | null;
  /** Milliseconds since it was decided, by the database's clock; undefined if it is not. */
  readonly ago: number | undefined;
  readonly overturned: boolean;
  readonly tracked: boolean;
};

/** A result as a correction keeps it: a versioned document of words and numbers only (T-220). */
export type GameResultDocument = {
  readonly version: 1;
  readonly status: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  /**
   * A correction's "before" of a game entered by hand that had box score lines (step 2.229,
   * T-365): every line as it was, so the save after the reopen may remove or replace them
   * and "put the sheet back" can restore them (A-5). Ids and numbers only, never a name
   * (T-220). Never counted anywhere: only `player_game_stats` rows count (S-27).
   */
  readonly sheet?: KeptSheet;
};

/** A box score as a correction keeps it (T-365): how it was recorded and its lines. */
export type KeptSheet = {
  readonly captureMode: 'box' | 'final' | 'live';
  readonly overtimePeriods: number | null;
  readonly lines: readonly KeptLine[];
};

/** One kept line: the line without its game id, with the jersey worn (a number, R-17). */
export type KeptLine = Omit<NewGameLine, 'gameId'>;

/** A correction as it was written, read back: its two documents (step 2.229). */
export type StoredGameCorrection = {
  readonly before: GameResultDocument;
  readonly after: GameResultDocument;
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

/** A line as the box score grid saves it: with the jersey the player wore (from the roster). */
export type NewGameLine = GameLine & { readonly jerseyNumber: string | null };

/** A roster entry of one of a game's two teams, by ids only (T-220). */
export type GameRosterEntry = { readonly teamId: string; readonly personId: string };

/** A player on the roster of one of a game's two teams, as the box score grid lists them (P7 §5.2). */
export type GameRosterPlayer = {
  readonly teamId: string;
  readonly personId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly jerseyNumber: string | null;
  /** The player has left the team since (R-17); still listed, as they may have played this game. */
  readonly left: boolean;
  /** The game at whose scorer's table they were added (S-6), or null; absent where not read. */
  readonly addedAtGameId?: string | null;
  /** Added at a table and not yet reviewed by an admin (S-6, S-45); absent where not read. */
  readonly needsReview?: boolean;
};

/** One reopening, with numbers only, never names (T-220). */
export type NewGameCorrection = {
  readonly gameId: string;
  readonly accountId: string;
  readonly reason: string;
  readonly before: GameResultDocument;
  readonly after: GameResultDocument;
};

/** Another game at the same time as one, with a team or the court in common (step 2.158). */
export type GameAtSameTime = {
  readonly id: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
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

/**
 * One round of earlier games, as the store counts them (step 2.156): the games of a round,
 * or of a season in no round, that started before the league's today and are decided or
 * called off (final, forfeit, postponed, cancelled), in no bin.
 */
export type EarlierRoundCount = {
  readonly seasonId: string;
  /** The program of the season: where scoring its games is checked. */
  readonly programId: string;
  /** Null for the season's games in no round. */
  readonly roundId: string | null;
  readonly number: number | null;
  readonly label: string | null;
  /** The first and last day its earlier games were played, in the league's time zone. */
  readonly firstDay: string;
  readonly lastDay: string;
  readonly games: number;
  /** How many of them the account asked about is assigned to score. */
  readonly assigned: number;
};

/** One round of earlier games: a round, or a season's games in no round. */
export type EarlierRoundRef = { readonly roundId: string } | { readonly seasonId: string };

/**
 * The games a person may score, as the lists that stop at a limit ask the store for them
 * (step 2.156): every game of `every`, and the games assigned to them of `assigned`, each
 * the whole league ('all') or these programs (none when empty). The store keeps only these
 * before it cuts, so a game of theirs is never pushed out by games they do not score.
 * Worked out by scoringReachOf (scoring-access.ts), by the one rule of mayScoreUnder.
 */
export type ScoringReach = {
  readonly every: 'all' | readonly string[];
  readonly assigned: 'all' | readonly string[];
};

export type GamesStore = {
  /** The game with this id, in the bin or not, or undefined if it is not in this league. */
  readonly find: (gameId: string) => Promise<GameRecord | undefined>;
  /**
   * Holds the game until the transaction ends: the same lock the tracker's commands take
   * (ScoringSessionsStore.lockGame, T-111), so a batch of plays and a result typed by
   * hand never pass each other. False if the game is not in this league.
   */
  readonly lockGame: (gameId: string) => Promise<boolean>;
  /**
   * Changes a game not in the bin if it is still at `version` (T-46): the new
   * version, or undefined if it is not there or moved on.
   */
  readonly setResult: (
    gameId: string,
    change: GameResultChange,
    version: number,
  ) => Promise<number | undefined>;
  /**
   * Marks a live game not started (S-40) if it is still at `version`: scheduled, no
   * score, and no rules of its own (the database empties the time they were fixed in
   * the same update, record 061). The new version, or undefined if it is not there,
   * in the bin, not live or moved on.
   */
  readonly markNotStarted: (gameId: string, version: number) => Promise<number | undefined>;
  /**
   * The format the game was GIVEN (step 2.119, migration 0026) as stored: null when it has
   * none, undefined when the game is not in this league. Kept apart from `format`, the
   * rules fixed at its start, so marking it not started returns it to this one.
   */
  readonly givenFormat: (gameId: string) => Promise<unknown>;
  /**
   * Gives the game its own format, or takes it away (null), if it is still at `version`,
   * not in the bin, scheduled or postponed and with no rules fixed: the new version, else
   * undefined.
   */
  readonly setGivenFormat: (
    gameId: string,
    format: GameFormatRules | null,
    version: number,
  ) => Promise<number | undefined>;
  /** Writes the correction row (S-7) in this transaction; the database needs it to change a decided game. */
  readonly addCorrection: (correction: NewGameCorrection) => Promise<void>;
  /** The game's corrections, newest first (by when written, then id; step 2.229, T-368). */
  readonly correctionsNewestFirst: (gameId: string) => Promise<readonly StoredGameCorrection[]>;
  /** Postponed games not in the bin, soonest first, of one season or all. */
  readonly listPostponed: (seasonId?: string) => Promise<readonly GameRecord[]>;
  /**
   * What the game was when it was last cancelled ("scheduled" or "postponed"), as its newest
   * `games.cancel_game` activity entry keeps it (step 2.158); undefined if none says.
   */
  readonly statusBeforeCancelled: (gameId: string) => Promise<string | undefined>;
  /**
   * Whether the game names a team, division, venue or court that is in the bin (the bin's
   * own rule, has-binned-game-part): it cannot be put back on the schedule before that is.
   */
  readonly partInBin: (gameId: string) => Promise<boolean>;
  /**
   * The games that hold the game's place now (the schedule's clash rule): not in the bin,
   * not postponed or cancelled, at exactly its start, with one of its teams or on its court.
   */
  readonly clashesOf: (gameId: string) => Promise<readonly GameAtSameTime[]>;
  /** A season's decided games (final or forfeit) not in the bin, in id order. */
  readonly listDecided: (seasonId: string) => Promise<readonly GameRecord[]>;
  /** The box score lines of a season's decided games not in the bin, by game and person. */
  readonly listDecidedLines: (seasonId: string) => Promise<readonly GameLine[]>;
  /** Every line of the game, whatever its status, by team and person. */
  readonly listLines: (gameId: string) => Promise<readonly GameLine[]>;
  /** Replaces all of the game's lines with these (none to clear them). */
  readonly replaceLines: (gameId: string, lines: readonly NewGameLine[]) => Promise<void>;
  /**
   * The players (not coaches) on either team's roster, those who have left included,
   * by team, roster order and name.
   */
  readonly listRoster: (gameId: string) => Promise<readonly GameRosterPlayer[]>;
  /**
   * Whether the person and team are both still in the league and one of them is in the bin
   * (A-5): left out of `listRoster`, but a restore brings them back (step 2.229, the put
   * back's refusal). False for one purged from the bin for good.
   */
  readonly inBin: (entry: GameRosterEntry) => Promise<boolean>;
  /** Whether the tracker has recorded any play of the game (T3 §8 `game_events`). */
  /** Whether the season is archived, so read-only (O-12, step 2.130); false if not here. */
  readonly seasonArchived: (seasonId: string) => Promise<boolean>;
  readonly hasPlays: (gameId: string) => Promise<boolean>;
  /** The program a season belongs to and its rules as stored, or undefined if it is not here. */
  readonly findSeason: (
    seasonId: string,
  ) => Promise<{ readonly programId: string; readonly rules: unknown } | undefined>;
  /** The league's own stored values of one setting (the league level), as a lookup reads them. */
  readonly leagueSettingRows: (key: string) => Promise<readonly StoredSetting[]>;
  /**
   * A season's games still to be decided (not final, forfeit or cancelled), not in the bin,
   * soonest first (those with no time last), with who is assigned to score each, in the
   * order they were assigned (step 2.56: Admin → Games → Scorekeepers).
   */
  readonly listSeasonAssignments: (seasonId: string) => Promise<SeasonAssignments>;
  /** Whether the account is assigned to score the game (T3 §8 `game_assignments`). */
  readonly isAssigned: (gameId: string, accountId: string) => Promise<boolean>;
  /** Assigns the account to the game: false if it already was. */
  readonly assign: (gameId: string, accountId: string) => Promise<boolean>;
  /** Removes the account's assignment to the game: false if there was none. */
  readonly unassign: (gameId: string, accountId: string) => Promise<boolean>;
  /**
   * The games of `days` days from the start of the league's today, with the account's
   * assignments, and every live game whenever it started (step 2.156: a game under way
   * since before the league's midnight is still on the list).
   */
  readonly listWindow: (accountId: string, days: number) => Promise<GamesWindow>;
  /**
   * The games of these ids that are in this league, not in the bin and of a season not in
   * the bin, with the account's assignments, in no set order (step 2.153: the games a
   * public page shows, for its "Score this game"). An id of no such game is left out.
   */
  readonly listByIds: (accountId: string, gameIds: readonly string[]) => Promise<GamesWindow>;
  /**
   * The games that still need a result (needs-result.ts) by the store's clock: live, or
   * scheduled with their start passed; in no bin, of a season in no bin; of those, the ones
   * in `reach`; oldest first, at most `limit`.
   */
  readonly listNeedingResult: (
    accountId: string,
    reach: ScoringReach,
    limit: number,
  ) => Promise<GamesWindow>;
  /**
   * The rounds of earlier games (EarlierRoundCount), counting only the games in `reach`
   * (a round with none of them is left out), the latest played first, at most `limit`.
   */
  readonly listEarlierRounds: (
    accountId: string,
    reach: ScoringReach,
    limit: number,
  ) => Promise<readonly EarlierRoundCount[]>;
  /**
   * One round's earlier games (as EarlierRoundCount counts them) in `reach`, soonest first,
   * at most `limit`.
   */
  readonly listEarlierRound: (
    accountId: string,
    reach: ScoringReach,
    round: EarlierRoundRef,
    limit: number,
  ) => Promise<GamesWindow>;
};

/** One scorekeeper assigned to one game (T3 §8 `game_assignments`). */
export type GameAssignment = { readonly gameId: string; readonly accountId: string };

/** A season's open games and their assignments, as listSeasonAssignments reads them. */
export type SeasonAssignments = {
  readonly games: readonly GameRecord[];
  readonly assignments: readonly GameAssignment[];
};

/** A games command's transaction: its store, the access reader and the activity log (A-6). */
export type GamesTx = CommandTx & {
  readonly games: GamesStore;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};

/**
 * The scorekeepers' read's transaction (step 2.56, T-305): the games one, whose access
 * also lists the league's grants in force, so the read can say who may be assigned.
 */
export type ScorekeepersTx = GamesTx & {
  readonly access: AccessReader & Pick<AccessStore, 'listGrants'>;
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
  /**
   * Holds this one game until the transaction ends (T-111): another transaction that
   * locks it waits here, while every other game goes on (T-112). Every command that
   * writes a game's session or its live game takes it first, then touches the session,
   * always in that order: a batch of taps and a takeover of the same game go one after
   * the other, so a batch from a displaced session can never commit after the takeover.
   * False if the game is not in this league.
   */
  readonly lockGame: (gameId: string) => Promise<boolean>;
  /** The game's session, whether its lease has run out or not. */
  readonly findForGame: (gameId: string) => Promise<ScoringSession | undefined>;
  /**
   * Starts the game's session unless it already has one, even one another request
   * started a moment ago: the new session, or undefined. Never throws for that, so
   * the transaction stays usable to read who won.
   */
  readonly start: (session: NewScoringSession) => Promise<ScoringSession | undefined>;
  /**
   * Moves the lease of the game's session `sessionId` on to `heldUntil`, in one write and
   * only if the lease runs out before `dueBefore` (T-295): false if nothing moved, because
   * the session is gone or its lease still runs past `dueBefore`.
   */
  readonly extend: (
    gameId: string,
    sessionId: string,
    heldUntil: number,
    dueBefore: number,
  ) => Promise<boolean>;
  /**
   * Ends the game's session `sessionId`. With `lapsedBy`, only if its lease had run out
   * by then, so a session renewed a moment ago is kept. False if nothing was ended.
   */
  readonly end: (gameId: string, sessionId: string, lapsedBy?: number) => Promise<boolean>;
  /**
   * Takes the game from its session `sessionId` (a takeover, or a lapse given away, T-335):
   * as `end`, it holds nothing from then on, but the server keeps whose it was and where it
   * was last heard (`LostScoringSession`), for "Send these plays". `at` is when, on the
   * server's clock. With `lapsedBy`, only if its lease had run out by then. False if
   * nothing was taken.
   */
  readonly lose: (
    gameId: string,
    sessionId: string,
    at: number,
    lapsedBy?: number,
  ) => Promise<boolean>;
  /**
   * The game's sequence the server answered the game's session `sessionId` with while it
   * held the game (T-335). A session starts heard at the game's last event then.
   */
  readonly heard: (gameId: string, sessionId: string, seq: number) => Promise<void>;
  /** The game's session `sessionId` the game was taken from, if the server keeps it. */
  readonly findLost: (gameId: string, sessionId: string) => Promise<LostScoringSession | undefined>;
  /** The game's sequence after a batch of lost session `sessionId`'s kept plays was taken. */
  readonly sent: (gameId: string, sessionId: string, seq: number) => Promise<void>;
};

/** What the server keeps of a session the game was taken from (T-335). */
export type LostScoringSession = {
  readonly id: string;
  readonly accountId: string;
  /** The game's sequence when the server last answered it while it held the game. */
  readonly heardSeq: number;
  /** The game's sequence after the last batch of its kept plays the server took. */
  readonly sentSeq?: number;
};

/** The scoring session commands' transaction: the games one, the sessions and the clock. */
export type ScoringTx = GamesTx & {
  readonly scoringSessions: ScoringSessionsStore;
  readonly clock: Clock;
};

/** One of a game's events as "send these plays" weighs it (T-335): which, what kind, by whom. */
export type GameEventMark = {
  readonly seq: number;
  readonly commandId: string;
  readonly type: string;
  readonly accountId: string | null;
  /** Where the play came from (T-408): left out for the scoring screen's own. */
  readonly source?: PlaySource;
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
  /**
   * True if the entry was on the team on the game's day: joined on or before it (or no
   * joining date) and not left by it (no leaving date, or one after it).
   */
  readonly onGameDay: boolean;
};

/** A box score line as the live game writes it: a line with the number worn in this game. */
export type LiveGameLine = GameLine & { readonly jerseyNumber: string | null };

/**
 * A player of one of a game's teams as the scorer's table changes them (record 058):
 * their current roster entry (not left) and the name on their person.
 */
export type TablePlayer = {
  readonly entryId: string;
  readonly teamId: string;
  readonly personId: string;
  readonly jerseyNumber: string | null;
  readonly firstName: string;
  readonly lastName: string;
  /** The game at whose scorer's table they were added (S-6), or null. */
  readonly addedAtGameId: string | null;
  /** Added at a table and not yet reviewed by an admin (S-6): only then theirs to rename or take off (S-45). */
  readonly needsReview: boolean;
};

/** A player added at a game's scorer's table: a new person on one of its teams (S-6, S-34). */
export type NewTablePlayer = {
  /** Made by the device, so the plays after it can name them (record 058). */
  readonly personId: string;
  readonly teamId: string;
  readonly gameId: string;
  readonly jerseyNumber: string | null;
  readonly firstName: string;
  readonly lastName: string;
  /** Marked for the league's admin to review (S-6). */
  readonly needsReview: boolean;
};

/** What a change of players writes: a field left out stays as it is. */
export type TablePlayerChange = {
  readonly jerseyNumber?: string | null;
  readonly firstName?: string;
  readonly lastName?: string;
};

/** An add the server refused, as its event keeps it: no name, only why. */
export type RefusedAdd = {
  readonly commandId: string;
  readonly playerId: string;
  /** The refusal's fixed code, as it was answered. */
  readonly problem: string;
};

/**
 * Why the database turned a change of players away. Each write runs in a savepoint of
 * its own, so the batch's transaction carries on (record 058), whatever the reason.
 */
export type TablePlayerRefusal =
  /** The season wants unique numbers and someone on the team wears it (0008, 0015). */
  | 'jersey-taken'
  /** The person's id is already taken, in this league or another. */
  | 'id-taken'
  /** The player has a box score line in another game. */
  | 'has-lines'
  /** The player has a line in this game's box score, entered by hand. */
  | 'in-box-score'
  /** Refused for a reason the database gave no known name to. */
  | 'failed';

/**
 * The live game's storage (T3 §8, T6 §1): its state, events and box score lines. Its
 * lock is the game's (ScoringSessionsStore.lockGame), shared with the session commands.
 */
export type LiveGamesStore = {
  readonly findState: (gameId: string) => Promise<SavedGameState | undefined>;
  /** Of these command ids, the ones the game has already taken (T3 §12). */
  readonly takenCommands: (
    gameId: string,
    commandIds: readonly string[],
  ) => Promise<readonly string[]>;
  readonly addEvents: (events: readonly NewGameEvent[]) => Promise<void>;
  /**
   * Whether the game was ever final or forfeited: a correction for it, or an `end` or
   * `reopen` in its event log. Such a game is never marked not started (S-40).
   */
  readonly wasDecided: (gameId: string) => Promise<boolean>;
  /** Writes the game's state as of event `seq`: the first time, or over the last one. */
  readonly saveState: (gameId: string, seq: number, state: unknown) => Promise<void>;
  /**
   * The players of the game's two teams, as their rosters have them, each person's
   * entry on the game's day listed first.
   */
  readonly players: (gameId: string) => Promise<readonly GamePlayer[]>;
  /** The game's box score lines as they are saved now. */
  readonly lines: (gameId: string) => Promise<readonly LiveGameLine[]>;
  /** Writes these lines, each added or replaced, and removes the lines of `removed` (person ids). */
  readonly saveLines: (
    gameId: string,
    lines: readonly LiveGameLine[],
    removed: readonly string[],
  ) => Promise<void>;
  /**
   * Who sent the game's latest end (its last `end` event): the account, null for an
   * event with none, or undefined if the game was never ended by its tracker.
   */
  readonly findLastEnd: (
    gameId: string,
  ) => Promise<{ readonly accountId: string | null } | undefined>;
  /**
   * How long ago the game was decided, in milliseconds, measured inside the database
   * (the start of the asking statement less the game's `finalized_at`, both its own
   * clock, so a wait for the game's lock counts), or undefined if
   * it is not decided. Never below 0.
   */
  readonly endedAgo: (gameId: string) => Promise<number | undefined>;
  /**
   * Who decided the game's present result by hand (step 2.177, migration 0028): the
   * account, or null when nobody did (its tracker ended it, it is not decided, it was
   * decided before 0028 or with no account). Read inside the database, as endedAgo is.
   */
  readonly decidedBy: (gameId: string) => Promise<string | null>;
  /**
   * For a list of games (step 2.177, T-349), in one read of the database: each of these
   * games of the league, with who decided it by hand (as decidedBy), how long ago it was
   * decided (as endedAgo), whether an overturn rules on it, and whether it is tracked (a
   * saved state with plays, as games.reopen_game tells them apart). Games not here, and
   * games in the bin, are left out.
   */
  readonly handResults: (gameIds: readonly string[]) => Promise<readonly HandResultFacts[]>;
  /** The game's event made by this command id: its number, type and sender, or undefined. */
  readonly findEvent: (
    gameId: string,
    commandId: string,
  ) => Promise<
    { readonly seq: number; readonly type: string; readonly accountId: string | null } | undefined
  >;
  /** The person's current entry (not left) on the team, or undefined (record 058). */
  readonly findTablePlayer: (teamId: string, personId: string) => Promise<TablePlayer | undefined>;
  /** Adds a new person and their roster entry, marked as added at the game (S-6). */
  readonly addTablePlayer: (player: NewTablePlayer) => Promise<'added' | TablePlayerRefusal>;
  /**
   * Gives a roster entry a new number (or none) and its person a new name (either part
   * may be empty, S-34), together or not at all. A rename keeps the name the player was
   * first given, the first time only, on the person for an admin to see and restore (S-45).
   */
  readonly changeTablePlayer: (
    entryId: string,
    personId: string,
    change: TablePlayerChange,
  ) => Promise<'changed' | TablePlayerRefusal>;
  /**
   * Takes a roster entry away and sends its person to the bin (T-45) when nothing else
   * holds them (no other entry, no account): a player added by mistake. Refused with
   * `has-lines` while the person has a box score line in a game other than `gameId`.
   * This game's lines follow its plays, which the command has already looked at, but only
   * once it has an engine state: with `thisGameToo` (none yet), a line of this game, one
   * entered from paper, refuses it too (`in-box-score`).
   */
  readonly removeTablePlayer: (
    entryId: string,
    personId: string,
    gameId: string,
    thisGameToo: boolean,
  ) => Promise<'removed' | TablePlayerRefusal>;
  /** The adds of this game the server refused, kept as events (record 058), oldest first. */
  readonly refusedAdds: (gameId: string) => Promise<readonly RefusedAdd[]>;
  /** The sequence number of the game's last event, its plays and its changes of players; 0 if none. */
  readonly lastEventSeq: (gameId: string) => Promise<number>;
  /**
   * The game's events after `afterSeq`, oldest first, at most `limit` of them: what
   * "send these plays" looks through to tell whether the game moved (S-43, T-335).
   */
  readonly eventsAfter: (
    gameId: string,
    afterSeq: number,
    limit: number,
  ) => Promise<readonly GameEventMark[]>;
};

/** The tracker's commands' transaction (step 2.29): the scoring one and the live game. */
export type TrackerTx = ScoringTx & { readonly liveGames: LiveGamesStore };
