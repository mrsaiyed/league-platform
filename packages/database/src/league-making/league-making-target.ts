// Where the tool that makes a league (step 2.125, record 057) makes it, opened and
// described in this one place: a PGlite database on this computer, or a hosted
// PostgreSQL database reached through two logins.
//
// On a hosted database each login does only what it must:
// - the app's own restricted login (the PLATFORM_DATABASE_URL the web app uses) runs
//   every command, through the league fence, exactly as the web app would;
// - the migration login (MIGRATION_DATABASE_URL), which owns the tables, does only
//   what nothing else can: reading the migration log and the accounts by email, and
//   adding (or removing) an account, which the app's role may not do (0005, 0012).
// On this computer one PGlite does both, as the seed does.
//
// Before anything else is read, each connection is asked one question: does this
// database hold the tracker's own schema, live_stats? If so it is refused, whatever
// the address said. The two logins must then reach the same database (its name, its
// id in the cluster and the server's start time). Where it is shown from what was
// really connected to: the connection's own host and port and the server's own
// current_database(), never from the address, and never the user or the password.
//
// The caller (scripts/make-league.mjs) runs the tracker's database guard on both
// addresses before calling this (packages/providers, record 055). Nothing here reads
// settings or picks a database by itself. The tests use PGlite only (T-201).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'kysely';
import { createDatabase } from '../db/create-database.ts';
import { kyselyOf, type DatabaseHandle } from '../db/database-handle.ts';
import {
  connectPostgresDriver,
  pgliteDriver,
  type MigrationDriver,
  type PostgresDriver,
  type PostgresDriverOptions,
  type SqlSession,
} from '../migrations/index.ts';

/** One login's address. SSL is set by `ssl` and `ca`, never by the address. */
export type PostgresAddress = { readonly url: string } & PostgresDriverOptions;

export type LeagueMakingSource =
  /** An open PGlite database (tests). It is not closed with the target. */
  | { readonly kind: 'pglite'; readonly pglite: PGlite }
  /** A PGlite database in a folder on this computer, which must already exist. */
  | { readonly kind: 'folder'; readonly folder: string }
  /** A hosted database: the migration login, and the app's own login for the commands. */
  | {
      readonly kind: 'hosted';
      readonly migration: PostgresAddress;
      readonly app: PostgresAddress;
    };

/** Where the target is, to show before anything is made: never a password or user name. */
export type LeagueMakingPlace =
  | { readonly kind: 'folder'; readonly folder: string }
  | {
      readonly kind: 'postgres';
      /** The host and port the migration login's connection really went to. */
      readonly host: string;
      readonly port: number;
      /** The server's own current_database(). */
      readonly database: string;
      /** The Supabase project reference, which is public, when the connection names one. */
      readonly project: string | null;
      readonly onThisComputer: boolean;
    }
  | { readonly kind: 'memory' };

export type Login = 'migration' | 'app';

export type LeagueMakingTarget = {
  /** The migration login's own session: accounts and checks, outside any league's fence. */
  readonly login: MigrationDriver;
  /** The commands' database, each command in its own fenced transaction. */
  readonly db: DatabaseHandle;
  /** 'own' when the commands run under the app's own login (hosted); 'shared' on PGlite. */
  readonly appLogin: 'own' | 'shared';
  readonly place: LeagueMakingPlace;
  readonly close: () => Promise<void>;
};

/** Which of the usual causes a failed connection points to, read from its code only. */
export type ConnectCause =
  | 'login'
  | 'database'
  | 'host'
  | 'network'
  | 'certificate'
  | 'ssl'
  | 'unknown';

export type OpenTargetProblem =
  | { readonly kind: 'no-database' }
  /** A database not on this computer whose certificate would not be checked. */
  | { readonly kind: 'certificate-not-checked'; readonly login: Login }
  | { readonly kind: 'cannot-connect'; readonly login: Login; readonly cause: ConnectCause }
  /** The database holds the tracker's own schema, live_stats. */
  | { readonly kind: 'tracker-database'; readonly login: Login }
  | { readonly kind: 'not-the-same-database' };

export type OpenTargetResult =
  | { readonly ok: true; readonly target: LeagueMakingTarget }
  | { readonly ok: false; readonly problem: OpenTargetProblem };

/** What one connection says about the database it reached: the first thing it reads. */
type ServerFacts = {
  readonly tracker: boolean;
  readonly database: string;
  readonly databaseOid: string;
  readonly started: string;
};

const serverFactsSql = `select
    exists (select 1 from pg_catalog.pg_namespace where nspname = 'live_stats') as tracker,
    current_database() as database,
    (select d.oid::text from pg_catalog.pg_database d where d.datname = current_database()) as database_oid,
    pg_catalog.pg_postmaster_start_time()::text as started`;

type ServerFactsRow = { tracker: boolean; database: string; database_oid: string; started: string };

const factsOf = (row: ServerFactsRow | undefined): ServerFacts => {
  if (row === undefined) throw new Error('The database said nothing about itself.');
  return {
    tracker: row.tracker === true,
    database: row.database,
    databaseOid: row.database_oid,
    started: row.started,
  };
};

async function sessionFacts(session: SqlSession): Promise<ServerFacts> {
  const { rows } = await session.query<ServerFactsRow>(serverFactsSql);
  return factsOf(rows[0]);
}

async function handleFacts(db: DatabaseHandle): Promise<ServerFacts> {
  const { rows } = await sql<ServerFactsRow>`${sql.raw(serverFactsSql)}`.execute(kyselyOf(db));
  return factsOf(rows[0]);
}

/** Whether a host the connection went to is this computer: localhost, loopback, a socket. */
export function hostOnThisComputer(host: string): boolean {
  const bare = host.replace(/^\[(.*)\]$/, '$1').toLowerCase();
  return (
    bare === '' ||
    bare.startsWith('/') ||
    bare === 'localhost' ||
    bare.endsWith('.localhost') ||
    /^127(?:\.\d{1,3}){3}$/.test(bare) ||
    bare === '::1'
  );
}

/**
 * The Supabase project reference a connection names, which is public: the direct host
 * (db.{ref}.supabase.co) or the pooler's user (postgres.{ref}). Null for anything else.
 */
export function supabaseProjectOf(host: string, user: string): string | null {
  const direct = /^db\.([a-z0-9]{15,})\.supabase\.co$/i.exec(host)?.[1];
  if (direct !== undefined) return direct.toLowerCase();
  const pooled = /\.supabase\.com$/i.test(host)
    ? /^[^.]+\.([a-z0-9]{15,})$/i.exec(user)?.[1]
    : undefined;
  return pooled === undefined ? null : pooled.toLowerCase();
}

/** The cause of a failed connection, from its code alone: a message can repeat the address. */
export function connectCauseOf(error: unknown): ConnectCause {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (code === '28P01' || code === '28000') return 'login';
  if (code === '3D000') return 'database';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'host';
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) {
    return 'network';
  }
  if (
    code.startsWith('ERR_TLS') ||
    code.includes('CERT') ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    message.includes('certificate')
  ) {
    return 'certificate';
  }
  if (message.includes('ssl')) return 'ssl';
  return 'unknown';
}

/** Whether an address's certificate would be checked: SSL "verify" with the certificate given. */
const checksCertificate = (address: PostgresAddress) =>
  (address.ssl ?? 'verify') === 'verify' && address.ca !== undefined && address.ca !== '';

/** The host of an address, as a URL reads it; the guard has already refused odd spellings. */
const addressHost = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).hostname);
  } catch {
    return '';
  }
};

async function pgliteTarget(
  pglite: PGlite,
  place: LeagueMakingPlace,
  owned: boolean,
): Promise<OpenTargetResult> {
  const driver = pgliteDriver(pglite);
  const closeOwn = async () => {
    if (owned) await pglite.close();
  };
  if ((await sessionFacts(driver)).tracker) {
    await closeOwn();
    return { ok: false, problem: { kind: 'tracker-database', login: 'migration' } };
  }
  const db = createDatabase({ kind: 'pglite', pglite });
  return {
    ok: true,
    target: {
      login: { ...driver, close: async () => {} },
      db,
      appLogin: 'shared',
      place,
      close: async () => {
        await db.close();
        await closeOwn();
      },
    },
  };
}

async function hostedTarget(
  source: Extract<LeagueMakingSource, { kind: 'hosted' }>,
): Promise<OpenTargetResult> {
  const refuse = (problem: OpenTargetProblem): OpenTargetResult => ({ ok: false, problem });
  // A database anywhere else has its certificate checked, or nothing is opened.
  for (const login of ['migration', 'app'] as const) {
    const address = source[login];
    if (!hostOnThisComputer(addressHost(address.url)) && !checksCertificate(address)) {
      return refuse({ kind: 'certificate-not-checked', login });
    }
  }
  const options = (address: PostgresAddress): PostgresDriverOptions => {
    const chosen: PostgresDriverOptions = { ca: address.ca };
    if (address.ssl !== undefined) chosen.ssl = address.ssl;
    return chosen;
  };

  let login: PostgresDriver;
  try {
    login = await connectPostgresDriver(source.migration.url, options(source.migration));
  } catch (error) {
    return refuse({ kind: 'cannot-connect', login: 'migration', cause: connectCauseOf(error) });
  }
  const closeLogin = () => login.close().catch(() => {});
  let loginFacts: ServerFacts;
  try {
    loginFacts = await sessionFacts(login);
  } catch (error) {
    await closeLogin();
    return refuse({ kind: 'cannot-connect', login: 'migration', cause: connectCauseOf(error) });
  }
  if (loginFacts.tracker) {
    await closeLogin();
    return refuse({ kind: 'tracker-database', login: 'migration' });
  }

  const db = createDatabase({
    kind: 'postgres',
    url: source.app.url,
    maxConnections: 2,
    ...options(source.app),
  });
  const closeBoth = async () => {
    await db.close().catch(() => {});
    await closeLogin();
  };
  let appFacts: ServerFacts;
  try {
    appFacts = await handleFacts(db);
  } catch (error) {
    await closeBoth();
    return refuse({ kind: 'cannot-connect', login: 'app', cause: connectCauseOf(error) });
  }
  if (appFacts.tracker) {
    await closeBoth();
    return refuse({ kind: 'tracker-database', login: 'app' });
  }
  if (
    appFacts.database !== loginFacts.database ||
    appFacts.databaseOid !== loginFacts.databaseOid ||
    appFacts.started !== loginFacts.started
  ) {
    await closeBoth();
    return refuse({ kind: 'not-the-same-database' });
  }

  const { host, port, user } = login.connectedTo;
  return {
    ok: true,
    target: {
      login,
      db,
      appLogin: 'own',
      place: {
        kind: 'postgres',
        host,
        port,
        database: loginFacts.database,
        project: supabaseProjectOf(host, user),
        onThisComputer: hostOnThisComputer(host),
      },
      close: closeBoth,
    },
  };
}

/** Opens the target. Close it when done. A refusal leaves nothing open. */
export async function openLeagueMakingTarget(
  source: LeagueMakingSource,
): Promise<OpenTargetResult> {
  if (source.kind === 'pglite') {
    return pgliteTarget(source.pglite, { kind: 'memory' }, false);
  }
  if (source.kind === 'folder') {
    const folder = path.resolve(source.folder);
    // A PGlite folder is made when it is opened; the tool never makes a database.
    if (!existsSync(path.join(folder, 'PG_VERSION'))) {
      return { ok: false, problem: { kind: 'no-database' } };
    }
    return pgliteTarget(new PGlite(folder), { kind: 'folder', folder }, true);
  }
  return hostedTarget(source);
}
