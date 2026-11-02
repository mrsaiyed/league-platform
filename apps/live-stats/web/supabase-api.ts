// The stats server's API, answered in the browser, for the static site on GitHub
// Pages. The pages make the same /api/... requests as when a server runs; here they
// are handled by the same service and basketball rules, with Supabase as the
// database. Bundled into js/supabase-api.js by scripts/build-pages.mjs.
import { ZodError } from 'zod';
import { TrackerError } from '../../../packages/sports/src/basketball/live.ts';
import {
  SupabaseError,
  SupabaseRepository,
} from '../../../packages/database/src/live-stats/supabase.ts';
import { LiveStats, StatsError } from '../service.ts';

export type Config = { url: string; key: string };
export type Request = { method?: string; body?: unknown };

/** An answer the pages show: a message and an HTTP-style status (0: no answer). */
export class ApiFailure extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN = 'live-stats:session';
const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** The scorer's session, kept on this device for its 7 days. */
function readToken(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(TOKEN) ?? 'null') as {
      token?: string;
      expiresAt?: string;
    } | null;
    if (!saved?.token || !(Date.parse(saved.expiresAt ?? '') > Date.now())) return null;
    return saved.token;
  } catch {
    return null;
  }
}
function writeToken(value: { token: string; expiresAt: string } | null) {
  try {
    if (value) localStorage.setItem(TOKEN, JSON.stringify(value));
    else localStorage.removeItem(TOKEN);
  } catch {
    // Private mode: the session lasts as long as the page.
  }
}

export function createApi({ url, key }: Config) {
  if (!url || !key) {
    return async () => {
      throw new ApiFailure(
        'This site is not connected to its database yet. Set SUPABASE_URL and SUPABASE_ANON_KEY for the site (see docs/operations/live-stats-hosting.md).',
        503,
      );
    };
  }
  let memoryToken: string | null = null;
  const token = () => readToken() ?? memoryToken;
  const repo = new SupabaseRepository({ url, key, token });
  const stats = new LiveStats(repo, () => repo.now());

  async function route(path: string, method: string, body: unknown): Promise<unknown> {
    const p = new URL(path, 'https://x').pathname;
    const match = (pattern: string) => new RegExp(`^${pattern}$`).exec(p)?.[1];

    if (p === '/api/session') {
      if (method === 'GET') {
        const t = token();
        const { canScore } = t
          ? await repo.rpc<{ canScore: boolean }>('ls_session', { p_token: t })
          : { canScore: false };
        if (t && !canScore) writeToken(null);
        return { canScore, signIn: true, watchUrls: [] };
      }
      if (method === 'POST') {
        const passcode = String((body as { passcode?: unknown })?.passcode ?? '');
        const r = await repo.rpc<{
          token?: string;
          expiresAt?: string;
          error?: string;
          status?: number;
        }>('ls_sign_in', { p_passcode: passcode.slice(0, 200) });
        if (!r.token) throw new ApiFailure(r.error ?? 'Sign-in failed.', r.status ?? 401);
        memoryToken = r.token;
        writeToken({ token: r.token, expiresAt: r.expiresAt ?? '' });
        return { canScore: true };
      }
      if (method === 'DELETE') {
        const t = token();
        writeToken(null);
        memoryToken = null;
        if (t) await repo.rpc('ls_sign_out', { p_token: t }).catch(() => {});
        return { canScore: false };
      }
    }

    if (method === 'GET') {
      if (p === '/api/schedule') return stats.schedule();
      if (p === '/api/schedule/version') return repo.rpc('ls_schedule_version');
      const version = match(`/api/games/(${ID})/version`);
      if (version) return repo.rpc('ls_game_version', { p_id: version });
      const game = match(`/api/games/(${ID})`);
      if (game) return stats.game(game);
      const team = match(`/api/teams/(${ID})`);
      if (team) return stats.team(team);
      const player = match(`/api/players/(${ID})`);
      if (player) return stats.playerLog(player);
      throw new ApiFailure('Not found.', 404);
    }

    if (!token())
      throw new ApiFailure(
        'Sign in to score. Your taps are kept on this device until you do.',
        401,
      );
    const command = match(`/api/games/(${ID})/commands`);
    if (method === 'POST' && command) return (await stats.command(command, body)).game;
    const players = match(`/api/teams/(${ID})/players`);
    if (method === 'POST' && players) return stats.addPlayer(players, body);
    const one = match(`/api/players/(${ID})`);
    if (one && method === 'PUT') return stats.updatePlayer(one, body);
    if (one && method === 'DELETE') return stats.removePlayer(one);
    throw new ApiFailure('Not found.', 404);
  }

  /** Answer a request as the server would, or throw an ApiFailure with its status. */
  return async function handle(path: string, { method = 'GET', body }: Request = {}) {
    try {
      return await route(path, method, body);
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      if (error instanceof StatsError) throw new ApiFailure(error.message, error.status);
      if (error instanceof ZodError)
        throw new ApiFailure(
          error.issues
            .map((i) => i.message)
            .slice(0, 3)
            .join(' '),
          422,
        );
      if (error instanceof TrackerError) throw new ApiFailure(error.message, 422);
      if (error instanceof SupabaseError) {
        // A signed-out scorer: forget the old session so the pages offer sign-in.
        if (error.status === 401) {
          writeToken(null);
          memoryToken = null;
        }
        throw new ApiFailure(error.message, error.status);
      }
      console.error(error);
      throw new ApiFailure('Something went wrong saving to the stats database. Try again.', 500);
    }
  };
}
