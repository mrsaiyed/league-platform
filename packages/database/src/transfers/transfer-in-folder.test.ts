// The transfer's guard (step 2.58, T-201): it opens a database folder on this computer
// and nothing else. An address is refused before anything is opened, and so is a folder
// that holds no database; neither is ever made here.
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDatabaseAddress, transferTrackerGamesInFolder } from './transfer-in-folder.ts';

let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'transfer-in-folder-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const options = () => ({
  backupFolder: path.join(root, 'no-backup'),
  workDir: path.join(root, 'work'),
  league: 'made-up',
  season: '2025-26',
  actorEmail: 'admin@example.test',
  dryRun: true,
  withOpponents: false,
});

describe('what reads as a database address', () => {
  it.each([
    'postgres://user:secret@db.example.test:5432/postgres',
    'postgresql://db.example.test/postgres',
    '  POSTGRES://db.example.test/postgres',
    'https://project.example.test',
    'file:///tmp/db',
    'postgres:secret@db.example.test',
    'pg@db.example.test',
    'host=db.example.test dbname=postgres',
    'user=postgres password=secret',
  ])('%s is an address', (value) => {
    expect(isDatabaseAddress(value)).toBe(true);
  });

  it.each([
    '.local/seed-db',
    'C:\\Users\\someone\\league-platform\\.local\\seed-db',
    '/home/someone/seed-db',
    'postgres-copy',
    'my host data',
  ])('%s is a folder', (value) => {
    expect(isDatabaseAddress(value)).toBe(false);
  });
});

describe('opening the database for the transfer', () => {
  it('refuses an address before opening anything', async () => {
    const outcome = await transferTrackerGamesInFolder(
      'postgres://user:secret@db.example.test:5432/postgres',
      options(),
    );
    expect(outcome).toEqual({ ok: false, problem: { kind: 'address-not-allowed' } });
  });

  it('refuses a folder with no database, and makes none there', async () => {
    const target = path.join(root, 'empty');
    await mkdir(target);
    const outcome = await transferTrackerGamesInFolder(target, options());
    expect(outcome).toEqual({ ok: false, problem: { kind: 'no-database' } });
    expect(await readdir(target)).toEqual([]);
    const missing = await transferTrackerGamesInFolder(path.join(root, 'not-there'), options());
    expect(missing).toEqual({ ok: false, problem: { kind: 'no-database' } });
    expect((await readdir(root)).includes('not-there')).toBe(false);
  });
});
