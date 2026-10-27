import type { GameState } from '../../../sports/src/basketball/live.ts';

/**
 * Where live stats are kept. The tracker, its pages and the basketball rules talk
 * only to this interface, so the database can change without touching them:
 * PostgreSQL today (embedded locally, Supabase when hosted), a document store
 * such as Firestore or another service later.
 *
 * It is deliberately shaped so a document database can implement it directly.
 * Records are whole documents, nothing needs a join or an aggregate query, and
 * the one write that touches several records, recording a scorer action, is a
 * single transaction callback: the way Firestore, DynamoDB and SQL transactions
 * all work. Every adapter must pass tests/live-stats-storage.test.mjs.
 */
export interface LiveStatsRepository {
  /** Create tables, collections or indexes if they are missing. Safe to repeat. */
  initialize(): Promise<void>;
  close(): Promise<void>;

  /** Add a team if its slug is new. Either way, return the team as stored. */
  ensureTeam(team: Omit<TeamRecord, 'id'>): Promise<TeamRecord>;
  teams(): Promise<TeamRecord[]>;

  /**
   * Add a fixture by its source reference (e.g. "tcsaal:653"), or update the
   * time, venue and teams of one nobody has tracked yet (revision 0). A game
   * that has been tracked is never changed by this.
   */
  upsertFixture(fixture: Fixture): Promise<void>;
  /** Games in schedule order, optionally only those a team plays in. */
  games(filter?: { teamId?: string }): Promise<GameRecord[]>;
  game(id: string): Promise<GameRecord | null>;

  /** Every player of these teams, removed ones included. */
  players(teamIds: string[]): Promise<PlayerRecord[]>;
  player(id: string): Promise<PlayerRecord | null>;
  addPlayer(player: PlayerRecord): Promise<void>;
  updatePlayer(id: string, change: PlayerChange): Promise<PlayerRecord | null>;

  /**
   * Record one scorer action, all or nothing. In one transaction: read the game;
   * if `commandId` was already recorded for it, change nothing and return
   * 'duplicate'; otherwise call `decide` with the game and save what it returns:
   * the command, the new state, score and status, the game's lines (replacing
   * the old ones) and the next revision. `decide` throws to refuse the action,
   * and may run more than once if the database retries the transaction, so it
   * must not have side effects.
   */
  record(
    gameId: string,
    commandId: string,
    decide: (game: GameRecord) => Recorded,
  ): Promise<'recorded' | 'duplicate' | 'missing'>;

  /** Box score lines of this team's players from its final games, for season totals. */
  finalLines(teamId: string): Promise<LineRecord[]>;
}

/** The order every adapter lists players in: 00, 0, 1 … 99, then no number; then by name. */
export function byJersey(a: { jersey: string; name: string }, b: { jersey: string; name: string }) {
  const key = (p: { jersey: string }) =>
    p.jersey === '' ? [1, 0, 0] : [0, Number(p.jersey), -p.jersey.length];
  const ka = key(a),
    kb = key(b);
  for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
  const na = a.name.toLowerCase(),
    nb = b.name.toLowerCase();
  return na < nb ? -1 : na > nb ? 1 : 0;
}

export type TeamRecord = {
  id: string;
  slug: string;
  name: string;
  school: string;
  /** The team this workspace keeps records for (Al-Hadi); everyone else is an opponent. */
  tracked: boolean;
  sourceUrl: string;
};

export type PlayerRecord = {
  id: string;
  teamId: string;
  name: string;
  jersey: string;
  /** Removed players stay, so games they played keep their lines. */
  active: boolean;
};
export type PlayerChange = Partial<Pick<PlayerRecord, 'name' | 'jersey' | 'active'>>;

export type GameStatus = 'scheduled' | 'live' | 'final';
export type GameRecord = {
  id: string;
  season: string;
  homeTeamId: string;
  awayTeamId: string;
  /** ISO 8601, or null when the date is not set. */
  startsAt: string | null;
  venue: string;
  venueAddress: string;
  gameType: string;
  source: string;
  sourceRef: string | null;
  sourceUrl: string;
  status: GameStatus;
  homeScore: number;
  awayScore: number;
  /** Bumped by every recorded action; viewers keep the highest they have seen. */
  revision: number;
  state: GameState;
};
export type Fixture = Omit<
  GameRecord,
  'id' | 'status' | 'homeScore' | 'awayScore' | 'revision' | 'sourceRef'
> & { id: string; sourceRef: string };

/** A player's box score line for one game, with their name and number at the time. */
export type LineRecord = {
  playerId: string;
  teamId: string;
  name: string;
  jersey: string;
  appeared: boolean;
  points: number;
  fg1: number;
  fg2: number;
  fg3: number;
  fouls: number;
  ms: number;
};

/** What recording one scorer action saves. */
export type Recorded = {
  state: GameState;
  status: GameStatus;
  homeScore: number;
  awayScore: number;
  lines: LineRecord[];
  /** The action as received, kept as the game's history. */
  command: unknown;
  acceptedAt: string;
};
