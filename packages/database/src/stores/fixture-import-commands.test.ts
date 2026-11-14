// Step 2.22 against the real database: a made-up file of 300 games is uploaded, read by the
// job's function, previewed, applied into the schedule draft and undone, each command one
// transaction (commandTransaction). Also: the job run twice does no harm, the file's text
// is gone from the row once read (T-80), published games take their waiting scores, and a
// file of one league cannot be applied by another. Isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  applyFixtureImport,
  getFixtureImport,
  maxReportBytes,
  parseDraftDocument,
  readFixtureImport,
  recordImportedScores,
  startFixtureImport,
  undoFixtureImport,
  type CommandDeps,
  type ImportScoresTx,
  type Job,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newCourt,
  newLeague,
  newSeason,
  newTeam,
  newVenue,
  one,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { gamesStore } from './games-store.ts';
import { importsStore } from './imports-store.ts';
import { schedulingStore } from './scheduling-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<ImportScoresTx>;
let jobs: Job[];
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  jobs = [];
  const transaction = commandTransaction<ImportScoresTx>(db, (scope) => ({
    jobs: { enqueue: async (job: Job) => void jobs.push(job) },
    imports: importsStore(scope),
    scheduling: schedulingStore(scope),
    games: gamesStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  deps = { transaction, events: [], log: () => {}, now: () => 0 };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

async function season() {
  const l = await newLeague(pglite);
  const seasonId = await newSeason(pglite, l.leagueId, l.defaultProgramId);
  const venueId = await newVenue(pglite, l.leagueId, 'Main Gym');
  await newCourt(pglite, l.leagueId, venueId, 'Court 1');
  await newCourt(pglite, l.leagueId, venueId, 'Court 2');
  for (const n of [1, 2, 3, 4]) {
    await newTeam(pglite, l.leagueId, seasonId, { name: `Team ${n}` });
  }
  return {
    as: { leagueId: l.leagueId, accountId: l.ownerId, requestId: 'r-1' },
    worker: { leagueId: l.leagueId, accountId: null, requestId: 'job-1' },
    leagueId: l.leagueId,
    seasonId,
    venueId,
  };
}

/** A made-up file of `count` games, one per day, with a score on every third. */
function csv(count: number): string {
  const lines = ['Date,Time,Home,Away,Venue,Court,Home score,Away score'];
  for (let n = 0; n < count; n += 1) {
    const day = new Date(Date.UTC(2027, 0, 2) + n * 86_400_000).toISOString().slice(0, 10);
    const home = (n % 4) + 1;
    const away = (home % 4) + 1;
    const scored = n % 3 === 0;
    lines.push(
      `${day},18:00,Team ${home},Team ${away},Main Gym,Court ${(n % 2) + 1},${scored ? 52 : ''},${scored ? 48 : ''}`,
    );
  }
  return lines.join('\n');
}

type World = Awaited<ReturnType<typeof season>>;

/** The job's work, as the worker does it: one transaction for the league, no account. */
const runJob = (w: World, importId: string) =>
  deps.transaction(w.worker, (tx) => readFixtureImport(tx, importId));

async function uploaded(w: World, text: string) {
  const started = await startFixtureImport(
    w.as,
    { seasonId: w.seasonId, fileName: 'fixtures.csv', fileText: text },
    deps,
  );
  if (!started.ok) throw new Error(`start refused: ${started.error.code}`);
  await runJob(w, started.value.importId);
  const view = await getFixtureImport(w.as, { importId: started.value.importId }, deps);
  if (!view.ok) throw new Error('no view');
  return { importId: started.value.importId, view: view.value };
}

const importRow = (importId: string) =>
  one<{ status: string; report: unknown; version: number; applied_at: Date | null }>(
    pglite,
    'select status, report, version, applied_at from imports where id = $1',
    [importId],
  );

describe('fixture import against the database', () => {
  it('imports, previews, applies and undoes a file of 300 games', async () => {
    const w = await season();
    const { importId, view } = await uploaded(w, csv(300));
    expect(view).toMatchObject({ status: 'ready', gameCount: 300, scoreCount: 100, rowsRead: 300 });
    expect(jobs.at(-1)).toMatchObject({ type: 'imports.run', ids: { importId } });

    const applied = await applyFixtureImport(w.as, { importId, version: view.version }, deps);
    expect(applied).toMatchObject({ ok: true, value: { gamesAdded: 300, scoresWaiting: 100 } });
    const draft = await one<{ changes: unknown; id: string }>(
      pglite,
      'select id, changes from schedule_drafts where season_id = $1',
      [w.seasonId],
    );
    expect(parseDraftDocument(draft.changes)?.changes).toHaveLength(300);
    // The draft is not the schedule: no game exists until it is published (A-9).
    expect(
      (
        await one<{ n: number }>(pglite, 'select count(*) n from games where season_id = $1', [
          w.seasonId,
        ])
      ).n,
    ).toBe(0);
    expect(await importRow(importId)).toMatchObject({ status: 'applied' });

    const now = await getFixtureImport(w.as, { importId }, deps);
    if (!now.ok) throw new Error('no view');
    expect(now.value.scoresWaiting).toBe(100);
    const undone = await undoFixtureImport(w.as, { importId, version: now.value.version }, deps);
    expect(undone).toEqual({ ok: true, value: { gamesRemoved: 300 } });
    expect(
      (
        await one<{ n: number }>(
          pglite,
          'select count(*) n from schedule_drafts where season_id = $1',
          [w.seasonId],
        )
      ).n,
    ).toBe(0);
    expect(await importRow(importId)).toMatchObject({ status: 'undone' });
  });

  it('does no harm when the job runs twice, and keeps no copy of the file once read', async () => {
    const w = await season();
    const { importId, view } = await uploaded(w, csv(5));
    const before = await importRow(importId);
    expect(JSON.stringify(before.report)).not.toContain('Date,Time,Home');
    expect(JSON.stringify(before.report)).not.toContain('"upload"');
    expect(await runJob(w, importId)).toBe('nothing-to-do');
    expect(await runJob(w, importId)).toBe('nothing-to-do');
    const after = await importRow(importId);
    expect(after.version).toBe(view.version);
    expect(after.report).toEqual(before.report);
    // Nothing in the whole database holds the file's text.
    const holders = await one<{ n: number }>(
      pglite,
      `select count(*) n from imports where league_id = $1 and report::text like '%Team 1,Team 2%'`,
      [w.leagueId],
    );
    expect(holders.n).toBe(0);
  });

  it('records the waiting scores once the games are published, and not twice', async () => {
    const w = await season();
    const { importId, view } = await uploaded(w, csv(6));
    await applyFixtureImport(w.as, { importId, version: view.version }, deps);
    const created = await one<{ created: { scores: { gameId: string }[] } }>(
      pglite,
      'select created from imports where id = $1',
      [importId],
    );
    expect(created.created.scores).toHaveLength(2);
    expect(await recordImportedScores(w.as, { importId }, deps)).toEqual({
      ok: true,
      value: { recorded: 0, waiting: 2, refused: 0, leftAlone: 0 },
    });
    // Publishing is a later step (2.21): stand in for it by making the first game.
    const first = created.created.scores[0]?.gameId;
    if (first === undefined) throw new Error('no game');
    const stage = await one<{ id: string }>(
      pglite,
      'insert into stages (league_id, season_id, name) values ($1, $2, $3) returning id',
      [w.leagueId, w.seasonId, 'Regular season'],
    );
    const teams = await pglite.query<{ id: string }>(
      'select id from teams where season_id = $1 order by name limit 2',
      [w.seasonId],
    );
    await pglite.query(
      `insert into games (id, league_id, season_id, stage_id, home_team_id, away_team_id, capture_mode)
       values ($1, $2, $3, $4, $5, $6, 'final')`,
      [first, w.leagueId, w.seasonId, stage.id, teams.rows[0]?.id, teams.rows[1]?.id],
    );
    expect(await recordImportedScores(w.as, { importId }, deps)).toEqual({
      ok: true,
      value: { recorded: 1, waiting: 1, refused: 0, leftAlone: 0 },
    });
    const game = await one<{ status: string; home_score: number; away_score: number }>(
      pglite,
      'select status, home_score, away_score from games where id = $1',
      [first],
    );
    expect(game).toEqual({ status: 'final', home_score: 52, away_score: 48 });
    expect(await recordImportedScores(w.as, { importId }, deps)).toEqual({
      ok: true,
      value: { recorded: 0, waiting: 1, refused: 0, leftAlone: 0 },
    });
  });

  it('is not found by another league, which cannot apply it', async () => {
    const w = await season();
    const other = await season();
    const { importId, view } = await uploaded(w, csv(3));
    const result = await applyFixtureImport(other.as, { importId, version: view.version }, deps);
    expect(result).toEqual({ ok: false, error: { code: 'import-not-found' } });
    expect(await importRow(importId)).toMatchObject({ status: 'ready' });
  });
});

describe('the size limits against the database’s own', () => {
  // The code stops a report or an upload at maxReportBytes of JSON text; the database
  // refuses a report whose jsonb text form (which adds a space after each colon and comma)
  // passes a megabyte. The most the code allows must fit, with the most spacing.
  async function fits(report: unknown) {
    const w = await season();
    const row = await one<{ size: number }>(
      pglite,
      `insert into imports (league_id, season_id, kind, account_id, report)
       select $1, $2, 'fixtures', $3, $4::jsonb returning octet_length(report::text) as size`,
      [w.leagueId, w.seasonId, w.as.accountId, JSON.stringify(report)],
    );
    return row.size;
  }

  it('holds the largest report the code allows', async () => {
    // Many tiny fixtures: the most colons and commas for the bytes.
    const tiny = { rowNumber: 1, date: 'a', time: null, homeTeamId: 'b', awayTeamId: 'c' };
    const fixtures: unknown[] = [];
    const report = () => ({
      version: 1,
      fileProblem: null,
      fixtures,
      problems: [],
      omittedProblems: 0,
      problemsNote: null,
      warnings: [],
      rowsRead: 0,
      columnsFound: [],
    });
    while (JSON.stringify(report()).length + 70 < maxReportBytes) fixtures.push(tiny);
    expect(JSON.stringify(report()).length).toBeLessThanOrEqual(maxReportBytes);
    expect(await fits(report())).toBeLessThanOrEqual(1_048_576);
  });

  it('holds the largest upload the code allows', async () => {
    // Characters that JSON escapes keep the text form and the JSON the same size.
    const text = '\n'.repeat(Math.floor((maxReportBytes - 40) / 2));
    const upload = { version: 1, upload: text };
    expect(JSON.stringify(upload).length).toBeLessThanOrEqual(maxReportBytes);
    expect(await fits(upload)).toBeLessThanOrEqual(1_048_576);
  });
});
