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
  /**
   * A migration login on a NEW connection, for the reads after a failure whose outcome
   * is uncertain (a commit whose reply was lost): what it sees is what the database
   * holds, not what a dying connection last said. The same session on PGlite, where
   * nothing is ever in flight. Close it when done.
   */
  readonly freshLogin: () => Promise<MigrationDriver>;
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
  /** Nothing answered within the time limit. */
  | 'timeout'
  /** The server answered with a code of its own (SQLSTATE) not sorted above: it was reached. */
  | 'refused'
  | 'unknown';

export type OpenTargetProblem =
  | { readonly kind: 'no-database' }
  /** A database not on this computer whose certificate would not be checked. */
  | { readonly kind: 'certificate-not-checked'; readonly login: Login }
  /** A hosted address with anything after "?": nothing may come from a query string. */
  | { readonly kind: 'query-string'; readonly login: Login }
  | {
      readonly kind: 'cannot-connect';
      readonly login: Login;
      readonly cause: ConnectCause;
      /** The server's 5-character code (SQLSTATE), when it answered; never its words. */
      readonly code: string | null;
    }
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

/**
 * Whether a host the connection went to counts as this computer: only the bare name
 * localhost, 127.0.0.1 or ::1, never another name, another loopback address or a
 * socket folder. A tunnel that brings a hosted database to localhost defeats this.
 */
export function hostOnThisComputer(host: string): boolean {
  const bare = host.replace(/^\[(.*)\]$/, '$1').toLowerCase();
  return bare === 'localhost' || bare === '127.0.0.1' || bare === '::1';
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

/**
 * The server's own 5-character code (SQLSTATE: two characters of class, then three) when
 * the error carries one, so the server was reached; null for the driver's and Node's own
 * codes (ECONNREFUSED, ERR_TLS...). A code is not a secret; the server's words are never
 * read, as they may repeat the address.
 */
export function serverCodeOf(error: unknown): string | null {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return /^(?:[0-5][0-9A-Z]|F0|HV|P0|XX)[0-9A-Z]{3}$/.test(code) ? code : null;
}

/** The cause of a failed connection, from its code alone: a message can repeat the address. */
export function connectCauseOf(error: unknown): ConnectCause {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (code === '28P01' || code === '28000') return 'login';
  if (code === '3D000') return 'database';
  // Any other code of the server's own (XX000 "tenant or user not found" from Supabase's
  // pooler, 53300 too many connections...): reached, and it refused (step 2.203 fix round).
  if (serverCodeOf(error) !== null) return 'refused';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'host';
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) {
    return 'network';
  }
  // Every refusal of a certificate by Node's TLS has a code (SELF_SIGNED_CERT_IN_CHAIN,
  // UNABLE_TO_GET_ISSUER_CERT_LOCALLY, ERR_TLS_CERT_ALTNAME_INVALID...): told by it alone,
  // never by the words, which could repeat what the server or the address said (2.203).
  if (
    code.startsWith('ERR_TLS') ||
    code.includes('CERT') ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
  ) {
    return 'certificate';
  }
  // pg's own fixed sentences, which carry no code: a server without SSL, and its timeout.
  if (message.includes('ssl')) return 'ssl';
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
  return 'unknown';
}

/** How long connecting may take before the tool gives up and says so, in ms. */
export const connectionTimeLimit = 15_000;

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
      freshLogin: async () => ({ ...driver, close: async () => {} }),
      close: async () => {
        await db.close();
        await closeOwn();
      },
    },
  };
}

/** The address's own refusal before anything connects, or undefined when it may be opened. */
function addressProblem(address: PostgresAddress, login: Login): OpenTargetProblem | undefined {
  // Nothing may come from a query string: the guard refuses the keys it knows, and
  // a hosted address carries none at all.
  if (/[?#]/.test(address.url)) return { kind: 'query-string', login };
  // A database anywhere else has its certificate checked, or nothing is opened.
  if (!hostOnThisComputer(addressHost(address.url)) && !checksCertificate(address)) {
    return { kind: 'certificate-not-checked', login };
  }
  return undefined;
}

const options = (address: PostgresAddress): PostgresDriverOptions => {
  const chosen: PostgresDriverOptions = { ca: address.ca };
  if (address.ssl !== undefined) chosen.ssl = address.ssl;
  // Connecting gives up after a time limit, with a plain message, rather than wait.
  chosen.connectionTimeoutMillis = address.connectionTimeoutMillis ?? connectionTimeLimit;
  return chosen;
};

type OpenedLogin =
  | { readonly ok: true; readonly login: PostgresDriver; readonly facts: ServerFacts }
  | { readonly ok: false; readonly problem: OpenTargetProblem };

/**
 * Connects the migration login and asks its first question (live_stats, the database's
 * name, id and start time), refusing the tracker's database. A refusal leaves it closed.
 */
async function openMigrationLogin(address: PostgresAddress): Promise<OpenedLogin> {
  const cannot = (error: unknown): OpenedLogin => ({
    ok: false,
    problem: {
      kind: 'cannot-connect',
      login: 'migration',
      cause: connectCauseOf(error),
      code: serverCodeOf(error),
    },
  });
  let login: PostgresDriver;
  try {
    login = await connectPostgresDriver(address.url, options(address));
  } catch (error) {
    return cannot(error);
  }
  const closeLogin = () => login.close().catch(() => {});
  let facts: ServerFacts;
  try {
    facts = await sessionFacts(login);
  } catch (error) {
    await closeLogin();
    return cannot(error);
  }
  if (facts.tracker) {
    await closeLogin();
    return { ok: false, problem: { kind: 'tracker-database', login: 'migration' } };
  }
  return { ok: true, login, facts };
}

/** Where a connected login really is, from the connection itself, never from the address. */
function postgresPlace(login: PostgresDriver, facts: ServerFacts): LeagueMakingPlace {
  const { host, port, user } = login.connectedTo;
  return {
    kind: 'postgres',
    host,
    port,
    database: facts.database,
    project: supabaseProjectOf(host, user),
    onThisComputer: hostOnThisComputer(host),
  };
}

async function hostedTarget(
  source: Extract<LeagueMakingSource, { kind: 'hosted' }>,
): Promise<OpenTargetResult> {
  const refuse = (problem: OpenTargetProblem): OpenTargetResult => ({ ok: false, problem });
  for (const login of ['migration', 'app'] as const) {
    const problem = addressProblem(source[login], login);
    if (problem !== undefined) return refuse(problem);
  }

  const opened = await openMigrationLogin(source.migration);
  if (!opened.ok) return refuse(opened.problem);
  const { login, facts: loginFacts } = opened;
  const closeLogin = () => login.close().catch(() => {});

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
    return refuse({
      kind: 'cannot-connect',
      login: 'app',
      cause: connectCauseOf(error),
      code: serverCodeOf(error),
    });
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

  return {
    ok: true,
    target: {
      login,
      db,
      appLogin: 'own',
      place: postgresPlace(login, loginFacts),
      freshLogin: () => connectPostgresDriver(source.migration.url, options(source.migration)),
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

/**
 * Where the release command (step 2.95, record 101) applies the database's changes: the
 * same PGlite database, or a hosted database through the migration login ALONE, which
 * owns the tables and is the only login that may change them (T-48). The same checks as
 * the league-making tool, from the same code: no query string, a certificate checked
 * for a database anywhere else, the tracker's schema refused whatever the address said,
 * and the place read from what was really connected to.
 */
export type MigrationTargetSource =
  | Extract<LeagueMakingSource, { kind: 'pglite' | 'folder' }>
  | { readonly kind: 'migration-login'; readonly migration: PostgresAddress };

export type MigrationTarget = {
  readonly login: MigrationDriver;
  readonly place: LeagueMakingPlace;
  readonly close: () => Promise<void>;
};

export type MigrationTargetResult =
  | { readonly ok: true; readonly target: MigrationTarget }
  | { readonly ok: false; readonly problem: OpenTargetProblem };

/** Opens the migration login's target. Close it when done. A refusal leaves nothing open. */
export async function openMigrationTarget(
  source: MigrationTargetSource,
): Promise<MigrationTargetResult> {
  if (source.kind !== 'migration-login') {
    const opened = await openLeagueMakingTarget(source);
    if (!opened.ok) return opened;
    const { login, place, close } = opened.target;
    return { ok: true, target: { login, place, close } };
  }
  const problem = addressProblem(source.migration, 'migration');
  if (problem !== undefined) return { ok: false, problem };
  const opened = await openMigrationLogin(source.migration);
  if (!opened.ok) return opened;
  const { login, facts } = opened;
  return {
    ok: true,
    target: {
      login,
      place: postgresPlace(login, facts),
      close: () => login.close().catch(() => {}),
    },
  };
}
