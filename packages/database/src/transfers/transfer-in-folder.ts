// The Al-Hadi transfer (step 2.58) on a platform database in a folder on this computer,
// for the script (scripts/transfer-tracker-games.mjs). Made-up data only (T-201): it opens
// a PGlite folder, never an address; anything that reads as a connection string is
// refused before anything is opened, and so is a folder that holds no database (one is
// never made here: `npm run seed` makes the test database).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  transferTrackerGames,
  type TransferOutcome,
  type TransferTrackerGamesOptions,
} from './transfer-tracker-games.ts';

/** Whether a value reads as a database address rather than a folder. */
export const isDatabaseAddress = (value: string) =>
  /^[a-z][a-z0-9+.-]*:\/\//iu.test(value.trim()) ||
  /^(postgres|postgresql|pg)[:@]/iu.test(value.trim()) ||
  /\b(host|user|password|dbname)=/iu.test(value);

export async function transferTrackerGamesInFolder(
  databaseFolder: string,
  options: Omit<TransferTrackerGamesOptions, 'pglite'>,
): Promise<TransferOutcome> {
  if (isDatabaseAddress(databaseFolder)) {
    return { ok: false, problem: { kind: 'address-not-allowed' } };
  }
  const folder = path.resolve(databaseFolder);
  if (!existsSync(path.join(folder, 'PG_VERSION'))) {
    return { ok: false, problem: { kind: 'no-database' } };
  }
  const pglite = new PGlite(folder);
  try {
    return await transferTrackerGames({ ...options, pglite });
  } finally {
    await pglite.close();
  }
}
