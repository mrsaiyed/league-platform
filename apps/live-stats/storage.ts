import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import type { LiveStatsRepository } from '../../packages/database/src/live-stats/repository.ts';
import type { Db } from '../../packages/database/src/live-stats/postgres.ts';

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
  if (env.DATABASE_URL?.trim()) return { kind: 'postgres', url: env.DATABASE_URL.trim() };
  if (env.LIVE_STATS_STORE === 'memory') return { kind: 'memory' };
  return { kind: 'local', dataDir: localDataDir(env, root) };
}

/** The embedded database's folder: LIVE_STATS_DATA_DIR, or .local/live-stats in the repository. */
export const localDataDir = (env: NodeJS.ProcessEnv, root: string) =>
  path.resolve(env.LIVE_STATS_DATA_DIR || path.join(root, '.local/live-stats'));

/** DATABASE_CA is the provider's certificate, as text or a file path, to verify the server. */
async function databaseCa(env: NodeJS.ProcessEnv) {
  if (!env.DATABASE_CA) return undefined;
  return env.DATABASE_CA.startsWith('-----BEGIN')
    ? env.DATABASE_CA
    : readFile(env.DATABASE_CA, 'utf8');
}

/** Open the chosen database. Drivers load only when used. The label never includes a password. */
export async function openStorage(
  choice: StorageChoice,
  env: NodeJS.ProcessEnv,
): Promise<{ repo: LiveStatsRepository; label: string }> {
  switch (choice.kind) {
    case 'postgres':
    case 'local': {
      const { PostgresRepository } = await import(
        '../../packages/database/src/live-stats/postgres.ts'
      );
      const { db, label } = await openDb(
        choice.kind === 'local' ? choice.dataDir : choice.url,
        env,
        {
          create: true,
        },
      );
      return { repo: new PostgresRepository(db), label };
    }
    case 'memory': {
      const { MemoryRepository } = await import('../../packages/database/src/live-stats/memory.ts');
      return { repo: new MemoryRepository(), label: 'memory only — nothing is kept when it stops' };
    }
  }
}

/**
 * A PostgreSQL database named by a connection string (hosted, such as Supabase) or
 * by a folder (embedded, on this computer). A folder must already hold a database
 * unless `create`.
 */
export async function openDb(
  spec: string,
  env: NodeJS.ProcessEnv,
  { create = false, max }: { create?: boolean; max?: number } = {},
): Promise<{ db: Db; label: string }> {
  if (/^postgres(?:ql)?:/i.test(spec.trim())) {
    const { connectPostgres, parseDatabaseUrl } = await import(
      '../../packages/database/src/live-stats/postgres.ts'
    );
    const db = await connectPostgres(spec, {
      ssl: env.DATABASE_SSL === 'off' ? 'off' : 'require',
      ca: await databaseCa(env),
      ...(max ? { max } : {}),
    });
    return { db, label: `PostgreSQL at ${parseDatabaseUrl(spec).hostname}` };
  }
  const dir = path.resolve(spec);
  if (!create && !existsSync(path.join(dir, 'PG_VERSION')))
    throw new Error(`There is no live stats database in ${dir}.`);
  const { PGlite } = await import('@electric-sql/pglite');
  return { db: new PGlite(dir) as unknown as Db, label: `local PostgreSQL in ${dir}` };
}

/**
 * Only one process opens an embedded database at a time. Takes the folder's lock,
 * which holds this process id, and returns the function that releases it. A lock
 * left by a process that was killed or crashed is cleared.
 */
export async function lockDataDir(
  dataDir: string,
  busy: (pid: number) => string = (pid) =>
    `The stats database is in use (process ${pid}). Stop that first.`,
): Promise<() => Promise<void>> {
  await mkdir(path.dirname(dataDir), { recursive: true });
  const file = `${dataDir}.lock`;
  const handle = await take(file, busy);
  let held = true;
  return async () => {
    if (!held) return;
    held = false;
    await handle.close();
    await unlink(file).catch(() => {});
  };
}

async function take(file: string, busy: (pid: number) => string): Promise<FileHandle> {
  try {
    const handle = await open(file, 'wx');
    await handle.writeFile(String(process.pid));
    return handle;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const pid = Number(await readFile(file, 'utf8').catch(() => ''));
    if (Number.isInteger(pid) && pid > 0 && running(pid)) throw new Error(busy(pid));
    await unlink(file);
    return take(file, busy);
  }
}

function running(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
