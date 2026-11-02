import type {
  Fixture,
  GameLineRecord,
  GameRecord,
  LineRecord,
  LiveStatsRepository,
  PlayerChange,
  PlayerRecord,
  Recorded,
  TeamRecord,
} from './repository.ts';

/**
 * Live stats kept in Supabase and reached straight from the browser, for the static
 * site on GitHub Pages: no server of its own. Every call is one of the database
 * functions in 002-api.sql, through Supabase's REST endpoint (/rest/v1/rpc/<name>)
 * with the project's public (anon or publishable) key. Reading is open; changes carry
 * the scorer session `token` and are refused without one.
 *
 * Recording an action reads the game, lets `decide` work out the result with the
 * basketball rules here in the browser, and saves it only if the game is still at
 * the revision it was read at; otherwise it reads again and decides again, as a
 * database transaction retry would. The same tests as every other adapter apply.
 */
export class SupabaseError extends Error {
  /** HTTP-style: 0 when there was no answer, 401 when the scorer must sign in. */
  status: number;
  code: string;
  constructor(message: string, status: number, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type SupabaseOptions = {
  /** The project URL, e.g. https://abcdefghijklmnopqrst.supabase.co */
  url: string;
  /** The project's anon or publishable key: public by design. */
  key: string;
  /** The scorer's session token, when signed in. */
  token?: () => string | null;
  timeoutMs?: number;
};

const RETRIES = 5;

export class SupabaseRepository implements LiveStatsRepository {
  #url: string;
  #key: string;
  #token: () => string | null;
  #timeoutMs: number;
  /** Database time minus this device's time, from the last answer that said. */
  #offset = 0;
  /** The game as last read, reused when an action is recorded straight after. */
  #lastGame: { game: GameRecord; at: number } | null = null;
  #teams: { teams: TeamRecord[]; at: number } | null = null;

  constructor({ url, key, token = () => null, timeoutMs = 12_000 }: SupabaseOptions) {
    this.#url = url.replace(/\/+$/, '');
    this.#key = key;
    this.#token = token;
    this.#timeoutMs = timeoutMs;
  }

  /** The database's clock, so every device reads the same game clock. */
  now() {
    return Date.now() + this.#offset;
  }

  /** Call one API function. Errors carry an HTTP-style status the pages understand. */
  async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.#timeoutMs);
    const sent = Date.now();
    let res: Response, text: string;
    try {
      res = await fetch(`${this.#url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: this.#key,
          Authorization: `Bearer ${this.#key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
        signal: abort.signal,
      });
      text = await res.text();
    } catch {
      throw new SupabaseError(
        abort.signal.aborted
          ? 'The stats database took too long to answer.'
          : 'No connection to the stats database.',
        0,
      );
    } finally {
      clearTimeout(timer);
    }
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new SupabaseError('The stats database sent an unreadable answer.', 0);
    }
    if (!res.ok) throw failure(res.status, body);
    const now = (body as { now?: unknown } | null)?.now;
    if (typeof now === 'number') this.#offset = now - (sent + Date.now()) / 2;
    return body as T;
  }

  /** Changes need the scorer's session; without one the database says 401 anyway. */
  #write<T>(name: string, args: Record<string, unknown>) {
    return this.rpc<T>(name, { p_token: this.#token() ?? '', ...args });
  }

  // Set up by supabase/setup.sql (or by the stats server, which runs the same files).
  async initialize() {}
  async close() {}

  async ensureTeam(team: Omit<TeamRecord, 'id'>) {
    this.#teams = null;
    return this.#write<TeamRecord>('ls_ensure_team', { p_team: team });
  }

  async teams() {
    // Teams change only when the schedule is loaded; a minute's reuse saves a call per tap.
    if (this.#teams && Date.now() - this.#teams.at < 60_000)
      return structuredClone(this.#teams.teams);
    const teams = await this.rpc<TeamRecord[]>('ls_teams');
    this.#teams = { teams, at: Date.now() };
    return structuredClone(teams);
  }

  async upsertFixture(fixture: Fixture) {
    await this.#write('ls_upsert_fixture', { p_fixture: fixture });
  }

  /** In schedule order. Listed games carry their state without plays other than period changes. */
  games(filter: { teamId?: string } = {}) {
    return this.rpc<GameRecord[]>('ls_games', { p_team_id: filter.teamId ?? null });
  }

  async game(id: string) {
    const { game } = await this.rpc<{ game: GameRecord | null }>('ls_game', { p_id: id });
    this.#lastGame = game ? { game: structuredClone(game), at: Date.now() } : null;
    return game;
  }

  players(teamIds: string[]) {
    return this.rpc<PlayerRecord[]>('ls_players', { p_team_ids: teamIds });
  }

  player(id: string) {
    return this.rpc<PlayerRecord | null>('ls_player', { p_id: id });
  }

  async addPlayer(player: PlayerRecord) {
    await this.#write('ls_add_player', { p_player: player });
  }

  updatePlayer(id: string, change: PlayerChange) {
    return this.#write<PlayerRecord | null>('ls_update_player', { p_id: id, p_change: change });
  }

  async record(gameId: string, commandId: string, decide: (game: GameRecord) => Recorded) {
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      const fresh =
        attempt === 0 &&
        this.#lastGame?.game.id === gameId &&
        Date.now() - this.#lastGame.at < 3_000;
      const game = fresh ? structuredClone(this.#lastGame!.game) : await this.game(gameId);
      if (!game) return 'missing' as const;
      // Saved already (a retry after a lost answer): applying it again would be wrong.
      if (game.state.recent.includes(commandId)) return 'duplicate' as const;
      const r = decide(game);
      const { result } = await this.#write<{ result: string }>('ls_record', {
        p_game_id: gameId,
        p_command_id: commandId,
        p_revision: game.revision,
        p_result: r,
      });
      this.#lastGame = null;
      if (result === 'recorded' || result === 'duplicate' || result === 'missing')
        return result as 'recorded' | 'duplicate' | 'missing';
      // 'conflict': another device saved something first. Read again and decide again.
    }
    throw new SupabaseError('The game kept changing while saving. Trying again.', 503);
  }

  finalLines(teamId: string) {
    return this.rpc<GameLineRecord[]>('ls_final_lines', { p_team_id: teamId });
  }

  gameLines(gameId: string) {
    return this.rpc<LineRecord[]>('ls_game_lines', { p_game_id: gameId });
  }
}

/** An error answer as a SupabaseError with a status and message fit for the scorer. */
function failure(status: number, body: unknown): SupabaseError {
  const b = (body ?? {}) as { code?: string; message?: string; msg?: string; error?: string };
  const code = b.code ?? '';
  // A function the database does not have: setup.sql has not been run (or is out of date).
  if (code === 'PGRST202' || code === '42883')
    return new SupabaseError(
      'The stats database is not set up yet: run supabase/setup.sql in the Supabase SQL editor.',
      503,
      code,
    );
  const custom = /^PT(\d{3})$/.exec(code);
  const message = b.message ?? b.msg ?? b.error ?? `The stats database answered ${status}.`;
  if (status === 401 && !custom)
    return new SupabaseError(
      'The site’s Supabase key was refused. Check SUPABASE_URL and SUPABASE_ANON_KEY.',
      503,
      code,
    );
  return new SupabaseError(message, custom ? Number(custom[1]) : status, code);
}
