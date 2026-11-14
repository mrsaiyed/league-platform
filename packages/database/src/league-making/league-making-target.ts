// Where the tool that makes a league (step 2.125, record 057) makes it: a PGlite
// folder on this computer, or the PostgreSQL address of the migration login, which the
// script reads from its settings. The tool needs both of that login's powers: adding
// an account (only the tables' owner may, 0005 and 0012) and seeing past the league
// fence while a league is made (record 008). Its commands still run as app_user, as
// every command does (withTransaction).
//
// Nothing here reads settings or picks a database by itself: the caller names one.
// The tests use PGlite only (T-201).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  connectPostgresDriver,
  pgliteDriver,
  type MigrationDriver,
  type PostgresDriverOptions,
} from '../migrations/index.ts';

export type LeagueMakingSource =
  /** An open PGlite database (tests). It is not closed with the target. */
  | { readonly kind: 'pglite'; readonly pglite: PGlite }
  /** A PGlite database in a folder on this computer, which must already exist. */
  | { readonly kind: 'folder'; readonly folder: string }
  /** The migration login's address. SSL is set by `ssl` and `ca`, never by the address. */
  | ({ readonly kind: 'postgres'; readonly url: string } & PostgresDriverOptions);

/** Where the target is, to show before anything is made: never a password or user name. */
export type LeagueMakingPlace =
  | { readonly kind: 'folder'; readonly folder: string }
  | { readonly kind: 'postgres'; readonly host: string; readonly database: string }
  | { readonly kind: 'memory' };

export type LeagueMakingTarget = {
  /** The login's own session: accounts and checks, outside any league's fence. */
  readonly login: MigrationDriver;
  /** The same database for the commands, each in its own fenced transaction. */
  readonly db: DatabaseHandle;
  readonly place: LeagueMakingPlace;
  readonly close: () => Promise<void>;
};

export type OpenTargetProblem = 'no-database' | 'cannot-connect';

/** The host and database name of a postgres:// address, leaving out who logs in. */
export function placeOfAddress(url: string): LeagueMakingPlace {
  const target = new URL(url);
  return {
    kind: 'postgres',
    host: target.port === '' ? target.hostname : `${target.hostname}:${target.port}`,
    database: decodeURIComponent(target.pathname.replace(/^\//, '')) || 'postgres',
  };
}

function pgliteTarget(pglite: PGlite, place: LeagueMakingPlace, owned: boolean) {
  const driver = pgliteDriver(pglite);
  const db = createDatabase({ kind: 'pglite', pglite });
  return {
    login: { ...driver, close: async () => {} },
    db,
    place,
    close: async () => {
      await db.close();
      if (owned) await pglite.close();
    },
  } satisfies LeagueMakingTarget;
}

/** Opens the target. Close it when done. */
export async function openLeagueMakingTarget(
  source: LeagueMakingSource,
): Promise<{ ok: true; target: LeagueMakingTarget } | { ok: false; problem: OpenTargetProblem }> {
  if (source.kind === 'pglite') {
    return { ok: true, target: pgliteTarget(source.pglite, { kind: 'memory' }, false) };
  }
  if (source.kind === 'folder') {
    const folder = path.resolve(source.folder);
    // A PGlite folder is made when it is opened; the tool never makes a database.
    if (!existsSync(path.join(folder, 'PG_VERSION'))) return { ok: false, problem: 'no-database' };
    return { ok: true, target: pgliteTarget(new PGlite(folder), { kind: 'folder', folder }, true) };
  }
  const options: PostgresDriverOptions = { ca: source.ca };
  if (source.ssl !== undefined) options.ssl = source.ssl;
  let login: MigrationDriver;
  try {
    login = await connectPostgresDriver(source.url, options);
  } catch {
    return { ok: false, problem: 'cannot-connect' };
  }
  const db = createDatabase({ kind: 'postgres', url: source.url, maxConnections: 2, ...options });
  return {
    ok: true,
    target: {
      login,
      db,
      place: placeOfAddress(source.url),
      close: async () => {
        await db.close();
        await login.close();
      },
    },
  };
}
