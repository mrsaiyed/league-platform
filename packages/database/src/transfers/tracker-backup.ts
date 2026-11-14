// The plain data read from a backup of the current live tracker's database (F-7). The
// transfer runner (step 2.58) turns it into the platform's teams, people, games, events
// and box score lines. Field names follow the tracker's tables (live_stats.*, written in
// packages/database/src/live-stats/001-schema.sql), in camelCase; nothing is renamed to
// the platform's shapes here, so the runner sees exactly what the tracker kept.

/** A team in the tracker: the one it keeps records for (`tracked`) or an opponent. */
export type BackupTeam = {
  id: string;
  slug: string;
  name: string;
  school: string;
  tracked: boolean;
  sourceUrl: string;
};

/** A player of a team. `jersey` is '' when the player has no number. */
export type BackupPlayer = {
  id: string;
  teamId: string;
  name: string;
  jersey: string;
  /** False once removed from new lineups; games they played keep their lines. */
  active: boolean;
};

/** One accepted scorer action, in the order it was taken. */
export type BackupEvent = {
  /** 1, 2, 3 … within the game (the tracker's `sequence`). */
  seq: number;
  commandId: string;
  /** The command's `type` ('score', 'foul', 'undo' …), or null if the stored command has none. */
  type: string | null;
  /** The command exactly as the tracker stored it. */
  command: unknown;
  /** ISO 8601. */
  acceptedAt: string;
};

/** One player's box score line in one game, as the tracker last saved it. */
export type BackupLine = {
  playerId: string;
  teamId: string;
  /** The player's name and number when the line was saved. */
  name: string;
  jersey: string;
  appeared: boolean;
  points: number;
  fg1: number;
  fg2: number;
  fg3: number;
  fouls: number;
  /** 0 in a backup made before the tracker kept turnovers. */
  turnovers: number;
  /** Time on court in milliseconds. */
  ms: number;
};

export type BackupGameStatus = 'scheduled' | 'live' | 'final';

/** A fixture, with everything recorded for it. */
export type BackupGame = {
  id: string;
  season: string;
  homeTeamId: string;
  awayTeamId: string;
  /** ISO 8601, or null when the game has no date. */
  startsAt: string | null;
  venue: string;
  venueAddress: string;
  gameType: string;
  /** Where the fixture came from, such as a league's game number. */
  source: string;
  sourceRef: string | null;
  sourceUrl: string;
  status: BackupGameStatus;
  homeScore: number;
  awayScore: number;
  /** How many actions the tracker accepted for the game. */
  revision: number;
  /** The tracker engine's last state, exactly as stored. */
  state: unknown;
  events: BackupEvent[];
  lines: BackupLine[];
};

/**
 * Everything in a backup. Teams are in slug order, players by team then id, games in
 * schedule order (undated last), events by `seq` and lines by team then player.
 */
export type TrackerBackup = {
  teams: BackupTeam[];
  players: BackupPlayer[];
  games: BackupGame[];
};

/**
 * Why a backup could not be read. The runner words these for people from its own
 * message file; `message` is only for logs.
 *  - missing: there is no such folder.
 *  - unreadable: the folder could not be copied (a file in it cannot be read).
 *  - not-a-database: the folder holds no database, or one that will not open.
 *  - not-a-tracker-backup: the database is missing the live tracker's tables or columns,
 *    or reading them failed.
 *  - in-use: a running stats server has the folder open; stop it first.
 *  - work-dir-unusable: the working folder cannot be made, or is inside the backup
 *    (`folder` is then the working folder).
 * `cause` holds the underlying error, when there is one, for logs.
 */
export type TrackerBackupProblem =
  | 'missing'
  | 'unreadable'
  | 'not-a-database'
  | 'not-a-tracker-backup'
  | 'in-use'
  | 'work-dir-unusable';

export class TrackerBackupError extends Error {
  readonly problem: TrackerBackupProblem;
  readonly folder: string;

  constructor(problem: TrackerBackupProblem, folder: string, cause?: unknown) {
    super(`Tracker backup ${folder}: ${problem}`, cause === undefined ? undefined : { cause });
    this.name = 'TrackerBackupError';
    this.problem = problem;
    this.folder = folder;
  }
}
