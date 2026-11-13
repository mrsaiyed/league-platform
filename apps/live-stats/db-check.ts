// Check the hosted database before game day: `npm run stats:db-check`.
//
// Connects with DATABASE_URL (from the environment or .env), creates the live stats
// tables if they are missing, writes a test record and reads it back inside a
// transaction that is then rolled back, so nothing is left behind, and reports
// what is stored and how quickly the database answers.
import { randomUUID } from 'node:crypto';
import {
  PostgresRepository,
  describeDatabaseError,
} from '../../packages/database/src/live-stats/postgres.ts';
import { openDb } from './storage.ts';

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error(
    'DATABASE_URL is not set. Put the Supabase connection string in a .env file in this folder\n' +
      '(see .env.example), or set it in the environment, and run this again.',
  );
  process.exit(1);
}

class RolledBack extends Error {}
const step = (text: string) => console.log(`✓ ${text}`);

let close = async () => {};
try {
  const started = performance.now();
  const { db, label } = await openDb(url, process.env, { max: 1 });
  close = () => db.close();
  const version = (await db.query<{ v: string }>("SELECT current_setting('server_version') AS v"))
    .rows[0]?.v;
  step(
    `Connected to ${label} (PostgreSQL ${version}) in ${Math.round(performance.now() - started)} ms`,
  );

  await new PostgresRepository(db).initialize();
  step('Live stats tables are ready (schema live_stats)');

  const slug = `db-check-${randomUUID()}`;
  await db
    .transaction(async (tx) => {
      await tx.query(
        `INSERT INTO live_stats.teams(id, slug, name) VALUES ($1, $2, 'Connection check')`,
        [randomUUID(), slug],
      );
      const back = await tx.query('SELECT 1 FROM live_stats.teams WHERE slug = $1', [slug]);
      if (back.rows.length !== 1) throw new Error('A test record could not be read back.');
      throw new RolledBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RolledBack)) throw error;
    });
  const left = await db.query('SELECT 1 FROM live_stats.teams WHERE slug = $1', [slug]);
  if (left.rows.length) throw new Error('The test record was not rolled back.');
  step('Saving works: a test record was written, read back and rolled back');

  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await db.query('SELECT 1');
    times.push(performance.now() - t);
  }
  const ms = Math.round(times.sort((a, b) => a - b)[2]!);
  step(`Round trip to the database: about ${ms} ms`);
  if (ms > 150)
    console.log(
      '  Each tap takes about a dozen round trips, so taps will save slowly from here. Taps are\n' +
        '  never lost (they wait on the scoring device), but a server closer to the database\n' +
        '  region, or a better connection, keeps the live page snappy.',
    );

  const count = async (table: string) =>
    Number(
      (await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM live_stats.${table}`)).rows[0]
        ?.n,
    );
  const tracked = (
    await db.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM live_stats.games WHERE revision > 0',
    )
  ).rows[0]?.n;
  console.log(
    `\nStored: ${await count('teams')} teams, ${await count('players')} players, ${await count('games')} games (${tracked} tracked), ${await count('game_events')} recorded actions.`,
  );
  console.log('The database is ready. Start the tracker with: npm run dev:stats');
} catch (error) {
  console.error(`✗ ${describeDatabaseError(error)}`);
  process.exitCode = 1;
} finally {
  await close().catch(() => {});
}
