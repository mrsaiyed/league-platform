import { describe, expect, it } from 'vitest';
import { parseDraftDocument } from '../scheduling/index.ts';
import { applyFixtureImport } from './apply-fixture-import.ts';
import { getFixtureImport } from './get-fixture-import.ts';
import { parseCreatedFixtures, uploadedText } from './import-documents.ts';
import {
  editorGrant,
  fixturesCsv,
  game,
  importUuid,
  memoryImports,
  otherSeasonId,
  ownerId,
  schedulerGrant,
  schedulerId,
  seasonId,
  venueUuid,
  editorId,
} from './memory-imports.test-helper.ts';
import { readFixtureImport } from './read-fixture-import.ts';
import { recordImportedScores } from './record-imported-scores.ts';
import { startFixtureImport } from './start-fixture-import.ts';
import { undoFixtureImport } from './undo-fixture-import.ts';

type World = ReturnType<typeof memoryImports>;

/** Starts an import as the owner and has the worker read it, as the job would. */
async function uploaded(world: World, text: string) {
  const started = await startFixtureImport(
    world.as(ownerId),
    { seasonId, fileName: 'fixtures.csv', fileText: text },
    world.deps,
  );
  if (!started.ok) throw new Error(`start refused: ${started.error.code}`);
  await world.deps.transaction(world.as(null), (tx) =>
    readFixtureImport(tx, started.value.importId),
  );
  const view = await getFixtureImport(
    world.as(ownerId),
    { importId: started.value.importId },
    world.deps,
  );
  if (!view.ok) throw new Error('no view');
  return { importId: started.value.importId, view: view.value };
}

describe('starting a fixtures import', () => {
  it('records the import and the job that reads it, with the id and nothing else', async () => {
    const world = memoryImports({ grants: [schedulerGrant] });
    const result = await startFixtureImport(
      world.as(schedulerId),
      { seasonId, fileName: 'fixtures.csv', fileText: fixturesCsv(3) },
      world.deps,
    );
    expect(result).toEqual({ ok: true, value: { importId: importUuid(1) } });
    expect(world.db.state.imports[0]).toMatchObject({
      status: 'reading',
      fileName: 'fixtures.csv',
    });
    expect(world.db.jobs).toEqual([
      {
        type: 'imports.run',
        leagueId: expect.any(String),
        ids: { importId: importUuid(1) },
        dedupeKey: importUuid(1),
      },
    ]);
    expect(JSON.stringify(world.db.jobs)).not.toContain('Team 1');
    expect(world.db.state.activity.map((a) => a.action)).toEqual(['imports.start_fixture_import']);
  });

  it('refuses people without the import permission, and a season that is not there', async () => {
    const world = memoryImports({ grants: [editorGrant] });
    const input = { seasonId, fileName: null, fileText: fixturesCsv(1) };
    expect(await startFixtureImport(world.as(editorId), input, world.deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(await startFixtureImport(world.as(null), input, world.deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    const missing = await startFixtureImport(
      world.as(ownerId),
      { ...input, seasonId: otherSeasonId },
      world.deps,
    );
    expect(missing).toEqual({ ok: false, error: { code: 'season-not-found' } });
    expect(world.db.state.imports).toEqual([]);
    expect(world.db.jobs).toEqual([]);
  });

  it('refuses a file too large to hold', async () => {
    const world = memoryImports();
    const huge = 'x'.repeat(2_100_000);
    expect(
      await startFixtureImport(
        world.as(ownerId),
        { seasonId, fileName: null, fileText: huge },
        world.deps,
      ),
    ).toEqual({ ok: false, error: { code: 'file-too-large' } });
  });
});

describe('reading a fixtures import (the worker job)', () => {
  it('reads the file once, keeps the report and not the file, and does no harm when run again', async () => {
    const world = memoryImports();
    const { importId, view } = await uploaded(world, fixturesCsv(5));
    expect(view).toMatchObject({
      status: 'ready',
      gameCount: 5,
      problems: [],
      fileName: 'fixtures.csv',
    });
    const stored = world.db.state.imports[0];
    expect(uploadedText(stored?.report)).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain('Date,Time,Home');
    const before = structuredClone(world.db.state.imports);
    const again = await world.deps.transaction(world.as(null), (tx) =>
      readFixtureImport(tx, importId),
    );
    expect(again).toBe('nothing-to-do');
    expect(world.db.state.imports).toEqual(before);
  });

  it('keeps every problem in plain words and refuses a file with no usable game', async () => {
    const world = memoryImports();
    const csv = 'Date,Home,Away\n2027-01-02,Team 1,Nobody FC\nnot a date,Team 1,Team 2';
    const { view } = await uploaded(world, csv);
    expect(view.status).toBe('failed');
    expect(view.problems.map((p) => p.message)).toEqual([
      expect.stringContaining('"Nobody FC" is not a team in this season'),
      expect.stringContaining('is not a date I can read'),
    ]);
  });

  it('marks a file in the wrong shape as failed with the reason', async () => {
    const world = memoryImports();
    const { view } = await uploaded(world, 'Team,Score\nA,1');
    expect(view.status).toBe('failed');
    expect(view.fileProblem).toMatch(/must name these columns/);
  });
});

describe('a file of 300 games', () => {
  it('imports, previews, applies and undoes', async () => {
    const world = memoryImports();
    const { importId, view } = await uploaded(world, fixturesCsv(300, { scoreEvery: 3 }));
    expect(view).toMatchObject({ status: 'ready', gameCount: 300, scoreCount: 100, rowsRead: 300 });
    expect(view.games).toHaveLength(100);

    const applied = await applyFixtureImport(
      world.as(ownerId),
      { importId, version: view.version },
      world.deps,
    );
    expect(applied).toMatchObject({ ok: true, value: { gamesAdded: 300, scoresWaiting: 100 } });
    const draft = parseDraftDocument(world.db.state.draft?.changes);
    expect(draft?.changes).toHaveLength(300);
    expect(draft?.changes[0]).toMatchObject({
      kind: 'add-game',
      game: {
        status: 'scheduled',
        venueId: venueUuid(1),
        court: 'Court 1',
        time: '18:00',
        recording: 'final-score',
      },
    });
    expect(world.db.state.imports[0]).toMatchObject({ status: 'applied' });

    const applyAgain = await applyFixtureImport(
      world.as(ownerId),
      { importId, version: view.version },
      world.deps,
    );
    expect(applyAgain).toEqual({ ok: false, error: { code: 'changed-since-read' } });
    expect(parseDraftDocument(world.db.state.draft?.changes)?.changes).toHaveLength(300);

    const now = await getFixtureImport(world.as(ownerId), { importId }, world.deps);
    if (!now.ok) throw new Error('no view');
    const undone = await undoFixtureImport(
      world.as(ownerId),
      { importId, version: now.value.version },
      world.deps,
    );
    expect(undone).toEqual({ ok: true, value: { gamesRemoved: 300 } });
    expect(world.db.state.draft).toBeUndefined();
    expect(world.db.state.imports[0]).toMatchObject({ status: 'undone' });
    expect(world.db.state.activity.map((a) => a.action)).toEqual([
      'imports.start_fixture_import',
      'imports.apply_fixture_import',
      'imports.undo_fixture_import',
    ]);
  });

  it('adds to a draft already there and undo leaves the admin’s own edits', async () => {
    const world = memoryImports();
    const first = await uploaded(world, fixturesCsv(4));
    await applyFixtureImport(
      world.as(ownerId),
      { importId: first.importId, version: first.view.version },
      world.deps,
    );
    const draftBefore = world.db.state.draft;
    expect(draftBefore).toBeDefined();
    // A second file lands in the same draft; undoing it keeps the first file's games.
    const csv2 = 'Date,Home,Away\n2027-06-01,Team 1,Team 2\n2027-06-02,Team 3,Team 4';
    const second = await uploaded(world, csv2);
    const applied = await applyFixtureImport(
      world.as(ownerId),
      { importId: second.importId, version: second.view.version },
      world.deps,
    );
    expect(applied.ok).toBe(true);
    expect(parseDraftDocument(world.db.state.draft?.changes)?.changes).toHaveLength(6);
    const view = await getFixtureImport(
      world.as(ownerId),
      { importId: second.importId },
      world.deps,
    );
    if (!view.ok) throw new Error('no view');
    const undone = await undoFixtureImport(
      world.as(ownerId),
      { importId: second.importId, version: view.value.version },
      world.deps,
    );
    expect(undone.ok).toBe(true);
    expect(parseDraftDocument(world.db.state.draft?.changes)?.changes).toHaveLength(4);
  });

  it('does not undo once the draft has changed since, and changes nothing', async () => {
    const world = memoryImports();
    const { importId, view } = await uploaded(world, fixturesCsv(5));
    await applyFixtureImport(world.as(ownerId), { importId, version: view.version }, world.deps);
    const draft = world.db.state.draft;
    if (draft === undefined) throw new Error('no draft');
    world.db.state.draft = { ...draft, version: draft.version + 1 };
    const applied = await getFixtureImport(world.as(ownerId), { importId }, world.deps);
    if (!applied.ok) throw new Error('no view');
    const result = await undoFixtureImport(
      world.as(ownerId),
      { importId, version: applied.value.version },
      world.deps,
    );
    expect(result).toEqual({ ok: false, error: { code: 'draft-changed' } });
    expect(world.db.state.imports[0]).toMatchObject({ status: 'applied' });
    expect(parseDraftDocument(world.db.state.draft?.changes)?.changes).toHaveLength(5);
  });
});

describe('applying refuses what has gone stale', () => {
  it('refuses when a venue named in the file was binned since the preview', async () => {
    const world = memoryImports();
    const { importId, view } = await uploaded(world, fixturesCsv(2));
    world.db.state.binnedVenueIds.push(venueUuid(1));
    expect(
      await applyFixtureImport(world.as(ownerId), { importId, version: view.version }, world.deps),
    ).toEqual({ ok: false, error: { code: 'venues-changed' } });
    expect(world.db.state.draft).toBeUndefined();
  });

  it('refuses when the schedule was published since the draft was started', async () => {
    const world = memoryImports();
    const { importId, view } = await uploaded(world, fixturesCsv(2));
    world.db.state.draft = {
      id: '01900000-0000-7000-8000-0000000f0009',
      seasonId,
      changes: { version: 1, changes: [] },
      basedOnRevision: null,
      version: 1,
    };
    world.db.state.latestRevision = 1;
    expect(
      await applyFixtureImport(world.as(ownerId), { importId, version: view.version }, world.deps),
    ).toEqual({ ok: false, error: { code: 'revision-out-of-date' } });
  });

  it('refuses an import that failed to read', async () => {
    const world = memoryImports();
    const { importId, view } = await uploaded(world, 'Team,Score\nA,1');
    expect(
      await applyFixtureImport(world.as(ownerId), { importId, version: view.version }, world.deps),
    ).toEqual({ ok: false, error: { code: 'not-ready' } });
  });
});

describe('recording the scores of an applied import', () => {
  it('records the scores of games published since, once, and leaves the rest waiting', async () => {
    const world = memoryImports();
    const { importId, view } = await uploaded(world, fixturesCsv(6, { scoreEvery: 2 }));
    await applyFixtureImport(world.as(ownerId), { importId, version: view.version }, world.deps);
    const created = parseCreatedFixtures(world.db.state.imports[0]?.created);
    expect(created?.scores).toHaveLength(3);

    // Nothing is published yet: everything waits and nothing changes.
    const none = await recordImportedScores(world.as(ownerId), { importId }, world.deps);
    expect(none).toEqual({
      ok: true,
      value: { recorded: 0, waiting: 3, refused: 0, leftAlone: 0 },
    });

    // Two of the three games are published.
    const [a, b] = created?.scores ?? [];
    if (a === undefined || b === undefined) throw new Error('no scores');
    world.db.state.games.push(game(a.gameId), game(b.gameId));
    const some = await recordImportedScores(world.as(ownerId), { importId }, world.deps);
    expect(some).toEqual({
      ok: true,
      value: { recorded: 2, waiting: 1, refused: 0, leftAlone: 0 },
    });
    expect(world.db.state.games.map((g) => [g.status, g.homeScore, g.awayScore])).toEqual([
      ['final', a.home, a.away],
      ['final', b.home, b.away],
    ]);
    expect(world.events.map((e) => e.type)).toEqual(['games.finalized', 'games.finalized']);

    // Running it again does no harm: nothing is recorded twice.
    const again = await recordImportedScores(world.as(ownerId), { importId }, world.deps);
    expect(again).toEqual({
      ok: true,
      value: { recorded: 0, waiting: 1, refused: 0, leftAlone: 0 },
    });
    expect(world.events).toHaveLength(2);
  });

  it('leaves a game alone that was decided by hand, and needs the right permission', async () => {
    const world = memoryImports({ grants: [editorGrant] });
    const { importId, view } = await uploaded(world, fixturesCsv(2, { scoreEvery: 1 }));
    await applyFixtureImport(world.as(ownerId), { importId, version: view.version }, world.deps);
    const created = parseCreatedFixtures(world.db.state.imports[0]?.created);
    const first = created?.scores[0];
    if (first === undefined) throw new Error('no score');
    world.db.state.games.push(game(first.gameId, { status: 'final', homeScore: 1, awayScore: 0 }));
    expect(await recordImportedScores(world.as(editorId), { importId }, world.deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    const result = await recordImportedScores(world.as(ownerId), { importId }, world.deps);
    expect(result).toEqual({
      ok: true,
      value: { recorded: 0, waiting: 1, refused: 0, leftAlone: 1 },
    });
    expect(world.db.state.games[0]).toMatchObject({ homeScore: 1, awayScore: 0 });
  });
});
