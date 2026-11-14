import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TrackerBackupError, readTrackerBackup } from './index.ts';

// The tracker's own schema, as its stats server creates it.
const schemaFile = fileURLToPath(new URL('../live-stats/001-schema.sql', import.meta.url));

const ids = {
  home: '00000000-0000-4000-8000-000000000001',
  away: '00000000-0000-4000-8000-000000000002',
  p1: '00000000-0000-4000-8000-000000000011',
  p2: '00000000-0000-4000-8000-000000000012',
  p3: '00000000-0000-4000-8000-000000000013',
  final: '00000000-0000-4000-8000-000000000021',
  later: '00000000-0000-4000-8000-000000000022',
  undated: '00000000-0000-4000-8000-000000000023',
  c1: '00000000-0000-4000-8000-000000000031',
  c2: '00000000-0000-4000-8000-000000000032',
  c3: '00000000-0000-4000-8000-000000000033',
};

/** A made-up backup: two teams, three players, three games, one of them tracked to the end. */
async function makeBackup(dir: string, { oldLines = false } = {}) {
  const db = new PGlite(dir);
  await db.exec(await readFile(schemaFile, 'utf8'));
  // A backup from before turnovers were kept.
  if (oldLines) await db.exec('ALTER TABLE live_stats.player_game_lines DROP COLUMN turnovers');
  await db.query(
    `INSERT INTO live_stats.teams(id, slug, name, school, tracked, source_url) VALUES
       ($1, 'riverside-owls', 'Riverside Owls', 'Riverside Academy', true, 'https://example.test/owls'),
       ($2, 'hillcrest-foxes', 'Hillcrest Foxes', 'Hillcrest School', false, '')`,
    [ids.home, ids.away],
  );
  await db.query(
    `INSERT INTO live_stats.players(id, team_id, name, jersey, active) VALUES
       ($1, $4, 'Sam Example', '4', true),
       ($2, $4, 'Kai Sample', '00', false),
       ($3, $5, '', '12', true)`,
    [ids.p1, ids.p2, ids.p3, ids.home, ids.away],
  );
  const state = { version: 1, plays: [{ type: 'score' }], period: 4 };
  await db.query(
    `INSERT INTO live_stats.games(id, season, home_team_id, away_team_id, starts_at, venue,
       venue_address, game_type, source, source_ref, source_url, status, home_score, away_score,
       revision, state) VALUES
       ($1, '2026-27', $4, $5, '2026-11-02T23:30:00Z', 'Main Gym', '1 Test Road', 'regular_season',
        'Made-up league', 'made-up:101', 'https://example.test/101', 'final', 5, 2, 3, $6),
       ($2, '2026-27', $5, $4, '2026-11-20T23:30:00Z', '', '', 'regular_season', '', 'made-up:102',
        '', 'scheduled', 0, 0, 0, '{}'),
       ($3, '2026-27', $4, $5, NULL, '', '', 'scrimmage', '', NULL, '', 'scheduled', 0, 0, 0, '{}')`,
    [ids.final, ids.later, ids.undated, ids.home, ids.away, JSON.stringify(state)],
  );
  await db.query(
    `INSERT INTO live_stats.game_events(game_id, sequence, command_id, command, accepted_at) VALUES
       ($1, 2, $3, $6, '2026-11-02T23:41:00Z'),
       ($1, 1, $2, $5, '2026-11-02T23:40:00Z'),
       ($1, 3, $4, '[]', '2026-11-03T01:00:00Z')`,
    [
      ids.final,
      ids.c1,
      ids.c2,
      ids.c3,
      JSON.stringify({ type: 'score', side: 'home', playerId: ids.p1, points: 3 }),
      JSON.stringify({ type: 'end' }),
    ],
  );
  const columns = oldLines
    ? 'game_id, player_id, team_id, name, jersey, appeared, points, fg1, fg2, fg3, fouls, ms'
    : 'game_id, player_id, team_id, name, jersey, appeared, points, fg1, fg2, fg3, fouls, ms, turnovers';
  const extra = oldLines ? '' : ', 2';
  await db.query(
    `INSERT INTO live_stats.player_game_lines(${columns}) VALUES
       ($1, $2, $4, 'Sam Example', '4', true, 5, 0, 1, 1, 2, 1500000${extra}),
       ($1, $3, $5, '', '12', true, 2, 2, 0, 0, 0, 900000${oldLines ? '' : ', 0'})`,
    [ids.final, ids.p1, ids.p3, ids.home, ids.away],
  );
  await db.close();
}

/** Every file under `dir` with the hash of its bytes. */
async function fingerprint(dir: string) {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    out[path.relative(dir, file)] = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
  }
  return out;
}

let root: string;
let backup: string;
let oldBackup: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'tracker-backup-test-'));
  backup = path.join(root, 'backup');
  oldBackup = path.join(root, 'old-backup');
  await makeBackup(backup);
  await makeBackup(oldBackup, { oldLines: true });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('readTrackerBackup', () => {
  it('reads a whole backup into plain data', async () => {
    const read = await readTrackerBackup(backup);

    expect(read.teams).toEqual([
      {
        id: ids.away,
        slug: 'hillcrest-foxes',
        name: 'Hillcrest Foxes',
        school: 'Hillcrest School',
        tracked: false,
        sourceUrl: '',
      },
      {
        id: ids.home,
        slug: 'riverside-owls',
        name: 'Riverside Owls',
        school: 'Riverside Academy',
        tracked: true,
        sourceUrl: 'https://example.test/owls',
      },
    ]);
    expect(read.players).toEqual([
      { id: ids.p1, teamId: ids.home, name: 'Sam Example', jersey: '4', active: true },
      { id: ids.p2, teamId: ids.home, name: 'Kai Sample', jersey: '00', active: false },
      { id: ids.p3, teamId: ids.away, name: '', jersey: '12', active: true },
    ]);

    expect(read.games.map((g) => g.id)).toEqual([ids.final, ids.later, ids.undated]);
    const [final, later, undated] = read.games;
    expect(final).toMatchObject({
      season: '2026-27',
      homeTeamId: ids.home,
      awayTeamId: ids.away,
      startsAt: '2026-11-02T23:30:00.000Z',
      venue: 'Main Gym',
      venueAddress: '1 Test Road',
      gameType: 'regular_season',
      source: 'Made-up league',
      sourceRef: 'made-up:101',
      sourceUrl: 'https://example.test/101',
      status: 'final',
      homeScore: 5,
      awayScore: 2,
      revision: 3,
      state: { version: 1, plays: [{ type: 'score' }], period: 4 },
    });
    expect(final?.events).toEqual([
      {
        seq: 1,
        commandId: ids.c1,
        type: 'score',
        command: { type: 'score', side: 'home', playerId: ids.p1, points: 3 },
        acceptedAt: '2026-11-02T23:40:00.000Z',
      },
      {
        seq: 2,
        commandId: ids.c2,
        type: 'end',
        command: { type: 'end' },
        acceptedAt: '2026-11-02T23:41:00.000Z',
      },
      // A stored command with no type is passed on as it is.
      {
        seq: 3,
        commandId: ids.c3,
        type: null,
        command: [],
        acceptedAt: '2026-11-03T01:00:00.000Z',
      },
    ]);
    expect(final?.lines).toEqual([
      {
        playerId: ids.p1,
        teamId: ids.home,
        name: 'Sam Example',
        jersey: '4',
        appeared: true,
        points: 5,
        fg1: 0,
        fg2: 1,
        fg3: 1,
        fouls: 2,
        turnovers: 2,
        ms: 1500000,
      },
      {
        playerId: ids.p3,
        teamId: ids.away,
        name: '',
        jersey: '12',
        appeared: true,
        points: 2,
        fg1: 2,
        fg2: 0,
        fg3: 0,
        fouls: 0,
        turnovers: 0,
        ms: 900000,
      },
    ]);
    expect(later).toMatchObject({ status: 'scheduled', events: [], lines: [], state: {} });
    expect(undated).toMatchObject({ startsAt: null, sourceRef: null, gameType: 'scrimmage' });
  });

  it('leaves the backup byte-for-byte unchanged and adds nothing beside it', async () => {
    const before = await fingerprint(backup);
    const work = path.join(root, 'work');
    await mkdir(work);
    await readTrackerBackup(backup, { workDir: work });
    expect(await fingerprint(backup)).toEqual(before);
    expect(existsSync(`${backup}.lock`)).toBe(false);
    // The working copy is gone.
    expect(await readdir(work)).toEqual([]);
  });

  it('reads a backup from before turnovers were kept, with none', async () => {
    const read = await readTrackerBackup(oldBackup);
    expect(read.games[0]?.lines.map((l) => l.turnovers)).toEqual([0, 0]);
    expect(read.games[0]?.lines[0]?.points).toBe(5);
  });

  it('says plainly why a folder cannot be read', async () => {
    const problem = (folder: string) =>
      readTrackerBackup(folder).then(
        () => 'read',
        (error: unknown) => (error instanceof TrackerBackupError ? error.problem : 'other'),
      );

    expect(await problem(path.join(root, 'nowhere'))).toBe('missing');

    const empty = path.join(root, 'empty');
    await mkdir(empty);
    expect(await problem(empty)).toBe('not-a-database');

    const other = path.join(root, 'other-database');
    const db = new PGlite(other);
    await db.exec('CREATE TABLE notes (id int)');
    await db.close();
    expect(await problem(other)).toBe('not-a-tracker-backup');

    // A folder a running stats server holds (this test's own process stands in for it).
    await writeFile(`${backup}.lock`, String(process.pid));
    try {
      expect(await problem(backup)).toBe('in-use');
    } finally {
      await rm(`${backup}.lock`);
    }
    // A lock left by a process that has stopped does not count.
    await writeFile(`${backup}.lock`, '999999999');
    try {
      expect(await problem(backup)).toBe('read');
    } finally {
      await rm(`${backup}.lock`);
    }
  });
});
