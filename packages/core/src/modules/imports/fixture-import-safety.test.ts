// What keeps a fixtures import safe (step 2.22 review): scoring alone does not let anyone record
// an import's scores, a league that is read-only refuses every change but may still be read,
// and an upload that can never be read is not kept (T-80).
import { describe, expect, it } from 'vitest';
import { applyFixtureImport } from './apply-fixture-import.ts';
import { discardFixtureImport } from './discard-fixture-import.ts';
import { getFixtureImport } from './get-fixture-import.ts';
import { parseCreatedFixtures, uploadedText } from './import-documents.ts';
import {
  fixturesCsv,
  game,
  memoryImports,
  ownerId,
  scorekeeperGrant,
  scorekeeperId,
  seasonId,
} from './memory-imports.test-helper.ts';
import { readFixtureImport } from './read-fixture-import.ts';
import { recordImportedScores } from './record-imported-scores.ts';
import { startFixtureImport } from './start-fixture-import.ts';
import { undoFixtureImport } from './undo-fixture-import.ts';

type World = ReturnType<typeof memoryImports>;

async function uploaded(world: World, text: string) {
  const started = await startFixtureImport(
    world.as(ownerId),
    { seasonId, fileName: 'fixtures.csv', fileText: text },
    world.deps,
  );
  if (!started.ok) throw new Error('start refused');
  await world.deps.transaction(world.as(null), (tx) =>
    readFixtureImport(tx, started.value.importId),
  );
  const view = await getFixtureImport(
    world.as(ownerId),
    { importId: started.value.importId },
    world.deps,
  );
  if (!view.ok) throw new Error('no view');
  return { importId: started.value.importId, version: view.value.version };
}

describe('recording an import’s scores', () => {
  it('is not open to a scorekeeper, who may score games but not run imports', async () => {
    const world = memoryImports({ grants: [scorekeeperGrant] });
    const { importId, version } = await uploaded(world, fixturesCsv(2, { scoreEvery: 1 }));
    await applyFixtureImport(world.as(ownerId), { importId, version }, world.deps);
    const created = parseCreatedFixtures(world.db.state.imports[0]?.created);
    for (const score of created?.scores ?? []) world.db.state.games.push(game(score.gameId));
    expect(await recordImportedScores(world.as(scorekeeperId), { importId }, world.deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(world.db.state.games.map((g) => g.status)).toEqual(['scheduled', 'scheduled']);
  });

  it('leaves a game waiting that cannot be scored for another reason than being decided', async () => {
    const world = memoryImports();
    const { importId, version } = await uploaded(world, fixturesCsv(2, { scoreEvery: 1 }));
    await applyFixtureImport(world.as(ownerId), { importId, version }, world.deps);
    const created = parseCreatedFixtures(world.db.state.imports[0]?.created);
    const [a, b] = created?.scores ?? [];
    if (a === undefined || b === undefined) throw new Error('no scores');
    // One game is in the bin: waiting, not given up on. One is cancelled: left alone.
    world.db.state.games.push(
      game(a.gameId, { binned: true }),
      game(b.gameId, { status: 'cancelled' }),
    );
    expect(await recordImportedScores(world.as(ownerId), { importId }, world.deps)).toEqual({
      ok: true,
      value: { recorded: 0, waiting: 1, refused: 0, leftAlone: 1 },
    });
    expect(
      parseCreatedFixtures(world.db.state.imports[0]?.created)?.scores.map((s) => s.recorded),
    ).toEqual([false, true]);
  });
});

describe('a league that is archived or suspended', () => {
  for (const status of ['archived', 'suspended']) {
    it(`refuses every import change in a ${status} league but still shows an import`, async () => {
      const world = memoryImports();
      const { importId, version } = await uploaded(world, fixturesCsv(2, { scoreEvery: 1 }));
      await applyFixtureImport(world.as(ownerId), { importId, version }, world.deps);
      const now = world.db.state.imports[0]?.version ?? 1;
      world.db.state.status = status;
      const refused = { ok: false, error: { code: 'not-allowed' } };
      expect(
        await startFixtureImport(
          world.as(ownerId),
          { seasonId, fileName: null, fileText: fixturesCsv(1) },
          world.deps,
        ),
      ).toEqual(refused);
      expect(
        await applyFixtureImport(world.as(ownerId), { importId, version: now }, world.deps),
      ).toEqual(refused);
      expect(
        await undoFixtureImport(world.as(ownerId), { importId, version: now }, world.deps),
      ).toEqual(refused);
      expect(await recordImportedScores(world.as(ownerId), { importId }, world.deps)).toEqual(
        refused,
      );
      expect(await discardFixtureImport(world.as(ownerId), { importId }, world.deps)).toEqual(
        refused,
      );
      expect(await getFixtureImport(world.as(ownerId), { importId }, world.deps)).toMatchObject({
        ok: true,
        value: { status: 'applied' },
      });
      expect(world.db.state.imports[0]).toMatchObject({ status: 'applied', version: now });
    });
  }
});

describe('an upload that is never read', () => {
  it('is discarded by the admin: the text is replaced and the import failed', async () => {
    const world = memoryImports();
    const started = await startFixtureImport(
      world.as(ownerId),
      { seasonId, fileName: 'fixtures.csv', fileText: fixturesCsv(3) },
      world.deps,
    );
    if (!started.ok) throw new Error('start refused');
    const { importId } = started.value;
    expect(uploadedText(world.db.state.imports[0]?.report)).toBeDefined();
    expect(await discardFixtureImport(world.as(ownerId), { importId }, world.deps)).toEqual({
      ok: true,
      value: {},
    });
    const row = world.db.state.imports[0];
    expect(row?.status).toBe('failed');
    expect(uploadedText(row?.report)).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain('Team 1');
    // A second discard, and a late job run, find nothing to do.
    expect(await discardFixtureImport(world.as(ownerId), { importId }, world.deps)).toEqual({
      ok: false,
      error: { code: 'not-reading' },
    });
    expect(
      await world.deps.transaction(world.as(null), (tx) => readFixtureImport(tx, importId)),
    ).toBe('nothing-to-do');
  });

  it('is not discarded once it has been read', async () => {
    const world = memoryImports();
    const { importId } = await uploaded(world, fixturesCsv(3));
    expect(await discardFixtureImport(world.as(ownerId), { importId }, world.deps)).toEqual({
      ok: false,
      error: { code: 'not-reading' },
    });
    expect(world.db.state.imports[0]?.status).toBe('ready');
  });
});
