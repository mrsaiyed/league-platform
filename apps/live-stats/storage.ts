import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { LiveStatsRepository } from '../../packages/database/src/live-stats/repository.ts';

export type StorageChoice =
  | { kind: 'postgres'; url: string }
  | { kind: 'local'; dataDir: string }
  | { kind: 'memory' };

/**
 * Which database to use, from the environment:
 *  - DATABASE_URL: hosted PostgreSQL, such as Supabase.
 *  - LIVE_STATS_STORE=memory: kept in memory only, for demos.
 *  - otherwise embedded PostgreSQL in LIVE_STATS_DATA_DIR (default .local/live-stats).
 * Another kind of database is another adapter in packages/database/src/live-stats
 * and another case here; nothing else changes.
 */
export function chooseStorage(env: NodeJS.ProcessEnv, root: string): StorageChoice {
  if (env.DATABASE_URL) return { kind: 'postgres', url: env.DATABASE_URL };
  if (env.LIVE_STATS_STORE === 'memory') return { kind: 'memory' };
  return {
    kind: 'local',
    dataDir: path.resolve(env.LIVE_STATS_DATA_DIR ?? path.join(root, '.local/live-stats')),
  };
}

/** Open the chosen database. Drivers load only when used. The label never includes a password. */
export async function openStorage(
  choice: StorageChoice,
  env: NodeJS.ProcessEnv,
): Promise<{ repo: LiveStatsRepository; label: string }> {
  switch (choice.kind) {
    case 'postgres': {
      const { PostgresRepository, connectPostgres } = await import(
        '../../packages/database/src/live-stats/postgres.ts'
      );
      // DATABASE_CA is the provider's certificate, as text or a file path, to verify the server.
      const ca = env.DATABASE_CA?.startsWith('-----BEGIN')
        ? env.DATABASE_CA
        : env.DATABASE_CA
          ? await readFile(env.DATABASE_CA, 'utf8')
          : undefined;
      const db = await connectPostgres(choice.url, {
        ssl: env.DATABASE_SSL === 'off' ? 'off' : 'require',
        ca,
      });
      return {
        repo: new PostgresRepository(db),
        label: `PostgreSQL at ${new URL(choice.url).hostname}`,
      };
    }
    case 'local': {
      const { PGlite } = await import('@electric-sql/pglite');
      const { PostgresRepository } = await import(
        '../../packages/database/src/live-stats/postgres.ts'
      );
      return {
        repo: new PostgresRepository(new PGlite(choice.dataDir)),
        label: `local PostgreSQL in ${choice.dataDir}`,
      };
    }
    case 'memory': {
      const { MemoryRepository } = await import('../../packages/database/src/live-stats/memory.ts');
      return { repo: new MemoryRepository(), label: 'memory only — nothing is kept when it stops' };
    }
  }
}
