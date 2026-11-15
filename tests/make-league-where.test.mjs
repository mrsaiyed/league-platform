// What `npm run league:make` prints as "Where", from a real connection: a made-up
// PGlite served on this computer's loopback address, standing in for a hosted
// database (T-201). The address names a user, a password and a database; the line
// shows the host and port really used and the server's own database name, and never
// the user or the password.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { openLeagueMakingTarget } from '@srleagues/database';
import { planLines, placeWords } from '../scripts/make-league.messages.mjs';

const plan = {
  name: 'Made-up Hoops',
  slug: 'made-up-hoops',
  sportKey: 'basketball',
  audience: 'youth',
  listed: false,
  listedChosen: false,
  city: 'Springfield',
  timeZone: 'America/Chicago',
  contactEmail: 'hello@example.test',
  ownerEmail: 'owner@example.test',
  staffEmail: 'staff@example.test',
  season: { name: 'Fall 2026', slug: 'fall-2026', startsOn: null, endsOn: null },
};
const preview = { ready: true, shortNameHeld: false, owner: 'none', staff: 'none' };

test('shows the host and the database, never who logs in or the password', async () => {
  const db = new PGlite();
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 4 });
  await server.start();
  const port = Number(server.getServerConn().split(':').at(-1));
  try {
    const url = `postgres://made-up-user:made-up-secret@127.0.0.1:${port}/name_in_the_address`;
    const opened = await openLeagueMakingTarget({
      kind: 'hosted',
      migration: { url, ssl: 'off' },
      app: { url, ssl: 'off' },
    });
    assert.ok(opened.ok, JSON.stringify(opened.problem));
    try {
      const actual = (await db.query('select current_database() as name')).rows[0].name;
      const lines = planLines(plan, preview, opened.target.place, '/made-up-hoops');
      const where = lines.find((line) => line.trimStart().startsWith('Where'));
      assert.ok(where !== undefined);
      // The host and port it really connected to, and the server's own database name.
      assert.ok(where.includes(`127.0.0.1:${port}`), where);
      assert.ok(where.includes(`the database ${actual} `), where);
      assert.ok(!where.includes('name_in_the_address'), where);
      assert.ok(where.includes('on this computer'), where);
      for (const line of lines) {
        assert.ok(!line.includes('made-up-user'), line);
        assert.ok(!line.includes('made-up-secret'), line);
      }
    } finally {
      await opened.target.close();
    }
  } finally {
    await server.stop();
    await db.close();
  }
});

test('says plainly when the database is not on this computer, with its Supabase project', () => {
  const where = placeWords({
    kind: 'postgres',
    host: 'aws-0-us-east-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    project: 'madeupprojectref0001',
    onThisComputer: false,
  });
  assert.equal(
    where,
    'the database postgres on aws-0-us-east-1.pooler.supabase.com:5432, Supabase project madeupprojectref0001, NOT on this computer: a hosted database; the commands run under the app’s own login, which reaches the same database',
  );
  assert.equal(
    placeWords({ kind: 'folder', folder: '/made-up/seed-db' }),
    'a folder: /made-up/seed-db',
  );
  // A folder may be a network share; another name may lead anywhere: never "on this
  // computer" for those.
  assert.ok(
    !placeWords({ kind: 'folder', folder: '\\\\share\\seed-db' }).includes('this computer'),
  );
  assert.ok(
    placeWords({
      kind: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      database: 'postgres',
      project: null,
      onThisComputer: true,
    }).includes('on this computer (localhost)'),
  );
});
