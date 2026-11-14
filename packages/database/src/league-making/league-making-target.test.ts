// Opening where a league is made. PGlite only, and one address on this computer where
// nothing listens (T-201).
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openLeagueMakingTarget, placeOfAddress } from './league-making-target.ts';

let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'league-making-target-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('placeOfAddress', () => {
  it('shows the host and the database, never who logs in or the password', () => {
    const place = placeOfAddress('postgres://someone:made-up-secret@db.example.test:5432/league');
    expect(place).toEqual({ kind: 'postgres', host: 'db.example.test:5432', database: 'league' });
    expect(JSON.stringify(place)).not.toMatch(/someone|made-up-secret/);
    expect(placeOfAddress('postgresql://db.example.test')).toEqual({
      kind: 'postgres',
      host: 'db.example.test',
      database: 'postgres',
    });
  });
});

describe('openLeagueMakingTarget', () => {
  it('refuses a folder with no database, and makes none there', async () => {
    const folder = path.join(root, 'empty');
    expect(await openLeagueMakingTarget({ kind: 'folder', folder })).toEqual({
      ok: false,
      problem: 'no-database',
    });
    expect(await readdir(root)).toEqual([]);
  });

  it('says so when the address cannot be reached', async () => {
    expect(
      await openLeagueMakingTarget({
        kind: 'postgres',
        url: 'postgres://made-up:made-up@127.0.0.1:1/none',
        ssl: 'off',
      }),
    ).toEqual({ ok: false, problem: 'cannot-connect' });
  });
});
