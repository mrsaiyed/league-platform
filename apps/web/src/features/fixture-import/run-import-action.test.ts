import { getFixtureImport, type AccessReader, type Grant } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInFixtureImport } from '../../server/stand-in-fixture-import.ts';
import { importNotice } from './import-notice.ts';
import { runImportAction } from './run-import-action.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const otherLeagueId = '01900000-0000-7000-8000-000000000002';
const owner = '01900000-0000-7000-8000-0000000000a1';
const scheduler = '01900000-0000-7000-8000-0000000000a2';
const coach = '01900000-0000-7000-8000-0000000000a3';
const grantOf = (n: number, accountId: string, role: Grant['role']): Grant => ({
  id: `01900000-0000-7000-8000-0000000000d${n}`,
  accountId,
  role,
  scope: { type: 'league' },
  grantedByAccountId: owner,
  revokedAt: null,
});
const grants = [grantOf(1, scheduler, 'scheduler'), grantOf(2, coach, 'coach')];
const access: AccessReader = {
  ownerAccountId: async () => owner,
  leagueStatus: async () => 'live',
  activeGrantsOf: async (account) => grants.filter((g) => g.accountId === account),
};

/** A made-up file: three good games, one unknown team and one bad date. */
const file = {
  name: 'fixtures.csv',
  text: [
    'Date,Time,Home,Away,Venue,Court,Home score,Away score',
    '2027-01-09,18:00,Lions,Tigers,Central Gym,Court 1,,',
    '2027-01-09,19:30,Hawks,Bears,Central Gym,Court 2,,',
    '2027-01-16,18:00,Lions,Comets,Central Gym,Court 1,,',
    '2027-02-30,18:00,Tigers,Hawks,Central Gym,Court 1,,',
    '2027-01-16,19:30,Bears,Lions,Central Gym,Court 2,52,47',
  ].join('\n'),
};

function setup() {
  const ports = standInFixtureImport({ leagueId, accessOf: () => access, log: () => {} });
  const as = (accountId: string, league = leagueId) => ({
    leagueId: league,
    accountId,
    requestId: 'r1',
  });
  const seasonOf = async (league = leagueId) => (await ports.currentSeasonOf(league))?.id;
  const view = async (importId: string, accountId = scheduler) => {
    const found = await getFixtureImport(as(accountId), { importId }, ports.deps);
    if (!found.ok) throw new Error(found.error.code);
    return found.value;
  };
  const upload = async (accountId = scheduler) =>
    runImportAction('upload', { text: {}, file }, as(accountId), ports.deps, await seasonOf());
  return { ports, as, seasonOf, view, upload };
}

describe('the fixture import screen actions', () => {
  it('uploads a file with two bad rows, applies it into the draft and undoes it', async () => {
    const { ports, as, seasonOf, view, upload } = setup();
    const season = (await seasonOf()) ?? '';
    const started = await upload();
    expect(started.ok).toBe(true);
    const importId = started.ok ? started.importId : '';

    // The stand-in's worker has read it: a report with every bad row in plain words.
    const report = await view(importId);
    expect(report).toMatchObject({ status: 'ready', gameCount: 3, scoreCount: 1, rowsRead: 5 });
    expect(report.problems.map((p) => p.rowNumber)).toEqual([4, 5]);
    expect(report.problems.every((p) => p.message.length > 0)).toBe(true);
    expect(await ports.draftChangeCount(leagueId, season)).toBe(0);

    const version = { importId, version: String(report.version) };
    const applied = await runImportAction(
      'apply',
      { text: version },
      as(scheduler),
      ports.deps,
      season,
    );
    expect(applied).toEqual({ ok: true, importId, clashCount: 0 });
    expect(await ports.draftChangeCount(leagueId, season)).toBe(3);
    const after = await view(importId);
    expect(after).toMatchObject({ status: 'applied', scoresWaiting: 1 });

    // The same page sent again is refused: the import moved on.
    expect(
      await runImportAction('apply', { text: version }, as(scheduler), ports.deps, season),
    ).toEqual({ ok: false, code: 'changed-since-read', importId });

    const undone = await runImportAction(
      'undo',
      { text: { importId, version: String(after.version) } },
      as(scheduler),
      ports.deps,
      season,
    );
    expect(undone).toEqual({ ok: true, importId });
    expect(await ports.draftChangeCount(leagueId, season)).toBe(0);
    expect((await view(importId)).status).toBe('undone');
  });

  it('refuses a person without the import permission, and another league', async () => {
    const { as, ports, seasonOf, upload } = setup();
    expect(await upload(coach)).toEqual({ ok: false, code: 'not-allowed' });
    const started = await upload(owner);
    const importId = started.ok ? started.importId : '';
    // Another league's context never finds this league's import or season.
    expect(await seasonOf(otherLeagueId)).toBeUndefined();
    const elsewhere = await getFixtureImport(as(owner, otherLeagueId), { importId }, ports.deps);
    expect(elsewhere.ok).toBe(false);
    expect(
      await runImportAction(
        'undo',
        { text: { importId, version: '2' } },
        as(owner, otherLeagueId),
        ports.deps,
        undefined,
      ),
    ).toMatchObject({ ok: false });
  });

  it('says plainly when there is no file or no season', async () => {
    const { as, ports, seasonOf } = setup();
    const season = await seasonOf();
    expect(
      await runImportAction('upload', { text: {} }, as(scheduler), ports.deps, season),
    ).toEqual({ ok: false, code: 'no-file' });
    expect(
      await runImportAction('upload', { text: {}, file }, as(scheduler), ports.deps, undefined),
    ).toEqual({ ok: false, code: 'no-season' });
  });

  it('forgets a file that is still waiting to be read only while it is', async () => {
    const { as, ports, seasonOf, upload } = setup();
    const started = await upload();
    const importId = started.ok ? started.importId : '';
    // The stand-in read it at once, so there is nothing left to forget.
    expect(
      await runImportAction(
        'discard',
        { text: { importId } },
        as(scheduler),
        ports.deps,
        await seasonOf(),
      ),
    ).toEqual({ ok: false, code: 'not-reading', importId });
  });
});

describe('the notice after a step', () => {
  it('names what was done, with the clashes an apply caused', () => {
    expect(importNotice({ done: 'apply', clashes: '2' })).toEqual({
      key: 'admin.import.done.apply',
      problem: false,
      clashes: 2,
    });
    expect(importNotice({ done: 'undo' })).toEqual({
      key: 'admin.import.done.undo',
      problem: false,
    });
  });

  it('turns a refusal into words, and anything unknown into the general one', () => {
    expect(importNotice({ problem: 'draft-changed' })).toEqual({
      key: 'admin.import.error.draft-changed',
      problem: true,
    });
    expect(importNotice({ problem: '<script>' })).toEqual({
      key: 'admin.import.error.unknown',
      problem: true,
    });
    expect(importNotice({ done: 'everything' })).toBeUndefined();
  });
});
