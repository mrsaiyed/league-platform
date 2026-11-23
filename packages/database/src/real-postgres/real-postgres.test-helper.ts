// What a test on the throw-away PostgreSQL (step 2.202, record 092) is given: the tables'
// owner's address, the app's login's address and the made-up authority's file, and
// nothing more. scripts/real-postgres.mjs writes them when it starts the server; the
// server's superuser is never among them. Tests import this file itself: the folder's
// index.ts is for the script, which Node runs and which must not load a test's helper.
//
// No server running is a failure in plain words, never a skipped test: start one with
// `node scripts/real-postgres.mjs start`, or run `npm run test:real-postgres`, which
// starts one for the run.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectionFileName, realPostgresFolder } from './prepare-real-postgres.ts';

// The questions a test asks of the server, beside its addresses.
export * from './real-postgres-probes.test-helper.ts';

/** The two addresses and the authority's file. */
export type RealPostgres = {
  /** The tables' owner, made as Supabase's `postgres` is: the login migrations run as. */
  readonly ownerUrl: string;
  /** The app's login, `app_login`: a member of app_user and sign_in_store, nothing more. */
  readonly appUrl: string;
  /** The made-up authority's certificate (PEM), which the server's certificate is signed by. */
  readonly caFile: string;
};

/** The repository's folder. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const notRunning = (folder: string) =>
  `No test PostgreSQL is running in ${folder}. Start one with ` +
  '`node scripts/real-postgres.mjs start`, or run `npm run test:real-postgres`, which ' +
  'starts one for the run and stops it after.';

function localOnly(name: string, value: unknown): string {
  if (typeof value !== 'string') throw new Error(`The test PostgreSQL's ${name} is missing.`);
  const url = new URL(value);
  // Only a server on this computer is ever a test's (T-201): refuse anything else.
  if (url.protocol !== 'postgres:' || url.hostname !== 'localhost' || url.search !== '') {
    throw new Error(`The test PostgreSQL's ${name} is not a plain address on localhost.`);
  }
  return value;
}

/** Reads the running server's two addresses and the authority's file. Throws when none runs. */
export function realPostgres(folder: string = realPostgresFolder): RealPostgres {
  const file = path.resolve(root, folder, connectionFileName);
  if (!existsSync(file)) throw new Error(notRunning(folder));
  const written = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const caFile = written.caFile;
  if (typeof caFile !== 'string' || !existsSync(caFile)) throw new Error(notRunning(folder));
  return {
    ownerUrl: localOnly('owner address', written.ownerUrl),
    appUrl: localOnly('app address', written.appUrl),
    caFile,
  };
}
