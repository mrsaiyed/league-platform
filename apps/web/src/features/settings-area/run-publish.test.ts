// The Publish button on the stand-in (step 2.240): the owner and an admin publish a draft;
// a scheduler, a scorekeeper, a registrar, an admin of one program only, another league's
// admin and a signed-out visitor cannot; a "Must fix" item not met refuses with its own
// sentence; publishing twice is harmless; an archived league is not brought back here.
import {
  setSetting,
  type AccessReader,
  type Audience,
  type CommandContext,
  type Grant,
  type Role,
} from '@srleagues/core';
import { catalogs } from '@srleagues/site';
import { beforeEach, describe, expect, it } from 'vitest';
import { standInAdminSettings } from '../../server/stand-in-admin-settings.ts';
import {
  forgetStandInStatuses,
  setStandInStatus,
  standInStatusOf,
} from '../../server/stand-in-league-states.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { problemKey } from './answer.ts';
import { runArchive, runPublish } from './run-publish.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const ownerId = '01900000-0000-7000-8000-0000000000a1';
const adminId = '01900000-0000-7000-8000-0000000000c1';
const schedulerId = '01900000-0000-7000-8000-0000000000c2';
const scorekeeperId = '01900000-0000-7000-8000-0000000000c3';
const otherAdminId = '01900000-0000-7000-8000-0000000000c4';
const registrarId = '01900000-0000-7000-8000-0000000000c5';
const programAdminId = '01900000-0000-7000-8000-0000000000c6';

const grant = (accountId: string, role: Role): Grant => ({
  id: `g-${accountId}`,
  accountId,
  role,
  scope: { type: 'league' },
  grantedByAccountId: null,
  revokedAt: null,
});
const grants = [
  grant(adminId, 'admin'),
  grant(schedulerId, 'scheduler'),
  grant(scorekeeperId, 'scorekeeper'),
  grant(registrarId, 'registrar'),
  { ...grant(programAdminId, 'admin'), scope: { type: 'program' as const, id: 'p1' } },
];

// The league starts as a draft and reads its state where the stand-in keeps it, as the
// app's access reader does; another league's admin holds a grant there, not here.
const accessOf = (id: string): AccessReader => ({
  ownerAccountId: async () => ownerId,
  leagueStatus: async () => standInStatusOf({ id, status: 'draft' }),
  activeGrantsOf: async (accountId) =>
    id === leagueId ? grants.filter((g) => g.accountId === accountId) : [],
});

const as = (accountId: string | null): CommandContext => ({
  leagueId,
  accountId,
  requestId: 'request-1',
});

const standIn = (audience: Audience) =>
  standInAdminSettings(
    testWorld(accessOf, undefined, (leagues) => {
      const at = leagues.findIndex((l) => l.leagueId === leagueId);
      const league = leagues[at];
      if (league === undefined) throw new Error('The test league is not in the seed.');
      leagues[at] = { ...league, audience };
    }),
  );

// The made-up league records children, so it is asked for its privacy choice too.
const names = { level: 'league', key: 'privacy.publicNames', version: null } as const;
const chooseNames = async (ports: ReturnType<typeof standIn>) => {
  const chose = await setSetting(as(ownerId), { ...names, value: 'fullName' }, ports.deps);
  expect(chose.ok).toBe(true);
};

const sentence = (code: string) => {
  const key = problemKey({ problem: `leagues.set_status.${code}` });
  return key === undefined ? undefined : catalogs['en']?.[key];
};

beforeEach(() => forgetStandInStatuses());

describe('runPublish', () => {
  it('lets the owner publish, and says so again when it is pressed twice', async () => {
    const ports = standIn('adult');
    await chooseNames(ports);
    expect(await runPublish(as(ownerId), ports.deps, 1)).toEqual({
      kind: 'done',
      done: 'published',
    });
    expect(standInStatusOf({ id: leagueId, status: 'draft' })).toBe('live');
    expect(await runPublish(as(ownerId), ports.deps, 1)).toEqual({
      kind: 'done',
      done: 'published',
    });
    expect(standInStatusOf({ id: leagueId, status: 'draft' })).toBe('live');
  });

  it('lets an admin publish', async () => {
    const ports = standIn('adult');
    await chooseNames(ports);
    expect(await runPublish(as(adminId), ports.deps, 1)).toMatchObject({ done: 'published' });
  });

  it('refuses a scheduler, a scorekeeper, a registrar, an admin of one program only, another league’s admin and a signed-out visitor', async () => {
    const ports = standIn('adult');
    await chooseNames(ports);
    for (const who of [
      schedulerId,
      scorekeeperId,
      registrarId,
      programAdminId,
      otherAdminId,
      null,
    ]) {
      expect(await runPublish(as(who), ports.deps, 1)).toEqual({
        kind: 'refused',
        command: 'leagues.set_status',
        code: 'not-allowed',
      });
    }
    expect(standInStatusOf({ id: leagueId, status: 'draft' })).toBe('draft');
  });

  it('publishes only a draft: an archived league is refused and stays archived', async () => {
    const ports = standIn('adult');
    await chooseNames(ports);
    setStandInStatus(leagueId, 'archived', 1);
    expect(await runPublish(as(ownerId), ports.deps, 2)).toEqual({
      kind: 'refused',
      command: 'leagues.set_status',
      code: 'illegal-transition',
    });
    expect(standInStatusOf({ id: leagueId, status: 'draft' })).toBe('archived');
  });

  it("refuses a youth league until its names are chosen, with that item's own sentence", async () => {
    const ports = standIn('youth');
    const answer = await runPublish(as(ownerId), ports.deps, 1);
    expect(answer).toMatchObject({ kind: 'refused', code: 'privacy-not-chosen' });
    expect(sentence('privacy-not-chosen')).toContain('Names on public pages');
    expect(sentence('no-contact-email')).toContain('contact email');
    await chooseNames(ports);
    expect(await runPublish(as(ownerId), ports.deps, 1)).toMatchObject({ done: 'published' });
  });
});

// Archive and Un-archive (step 2.125 part 2, U-9, U-14).
describe('runArchive', () => {
  const versionOf = async (ports: ReturnType<typeof standIn>) =>
    (await ports.deps.transaction(as(ownerId), (tx) => tx.leagues.currentLeague()))?.version ??
    Number.NaN;

  it('lets an admin archive a published league and the owner bring it back', async () => {
    const ports = standIn('adult');
    await chooseNames(ports);
    expect(await runPublish(as(ownerId), ports.deps, 1)).toMatchObject({ done: 'published' });
    expect(await runArchive(as(adminId), ports.deps, 'archived', await versionOf(ports))).toEqual({
      kind: 'done',
      done: 'archived',
    });
    expect(standInStatusOf({ id: leagueId, status: 'draft' })).toBe('archived');
    // Pressed twice: done, nothing changes.
    expect(await runArchive(as(adminId), ports.deps, 'archived', 1)).toMatchObject({
      done: 'archived',
    });
    expect(await runArchive(as(ownerId), ports.deps, 'live', await versionOf(ports))).toEqual({
      kind: 'done',
      done: 'unarchived',
    });
    expect(standInStatusOf({ id: leagueId, status: 'draft' })).toBe('live');
  });

  it('refuses a scheduler, and never archives or "un-archives" a draft', async () => {
    const ports = standIn('adult');
    await chooseNames(ports);
    expect(await runArchive(as(ownerId), ports.deps, 'live', 1)).toMatchObject({
      kind: 'refused',
      code: 'illegal-transition',
    });
    expect(await runArchive(as(ownerId), ports.deps, 'archived', 1)).toMatchObject({
      kind: 'refused',
      code: 'illegal-transition',
    });
    await runPublish(as(ownerId), ports.deps, 1);
    expect(
      await runArchive(as(schedulerId), ports.deps, 'archived', await versionOf(ports)),
    ).toMatchObject({ kind: 'refused' });
    expect(standInStatusOf({ id: leagueId, status: 'draft' })).toBe('live');
  });
});
