import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrationChecksum } from './checksum.ts';
import { loadMigrations } from './load-migrations.ts';

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function folderWith(files: Record<string, string>): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'migrations-'));
  folders.push(folder);
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(folder, name), text);
  return folder;
}

describe('loadMigrations', () => {
  it('reads the repository folder', async () => {
    const loaded = await loadMigrations();
    expect(loaded.ok && loaded.value[0]?.name).toBe('0001_migration_log.sql');
  });

  it('orders by number, ignores other files and normalises the text', async () => {
    const folder = await folderWith({
      '0002_b.sql': 'select 2;\r\n',
      '0001_a.sql': String.fromCharCode(0xfeff) + 'select 1;\n',
      'README.md': 'notes',
    });
    const loaded = await loadMigrations(folder);
    expect(loaded).toEqual({
      ok: true,
      value: [
        {
          version: 1,
          name: '0001_a.sql',
          sql: 'select 1;\n',
          checksum: migrationChecksum('select 1;\n'),
        },
        {
          version: 2,
          name: '0002_b.sql',
          sql: 'select 2;\n',
          checksum: migrationChecksum('select 2;\n'),
        },
      ],
    });
  });

  it('accepts an empty folder', async () => {
    expect(await loadMigrations(await folderWith({}))).toEqual({ ok: true, value: [] });
  });

  it.each([
    ['a badly named file', { '0001_a.sql': 'select 1;', '2_b.sql': 'select 2;' }, 'bad_file_name'],
    ['an upper-case name', { '0001_Teams.sql': 'select 1;' }, 'bad_file_name'],
    ['a hyphenated name', { '0001-teams.sql': 'select 1;' }, 'bad_file_name'],
    [
      'two files with one number',
      { '0001_a.sql': 'select 1;', '0001_b.sql': 'select 1;' },
      'duplicate_version',
    ],
    [
      'a gap in the numbers',
      { '0001_a.sql': 'select 1;', '0003_c.sql': 'select 3;' },
      'version_gap',
    ],
    ['numbers that do not start at 0001', { '0002_b.sql': 'select 2;' }, 'version_gap'],
    ['an empty file', { '0001_a.sql': ' \n' }, 'empty_file'],
    ['a file of only comments', { '0001_a.sql': '-- later\n/* maybe */\n;\n' }, 'empty_file'],
    [
      'a BEGIN',
      { '0001_a.sql': 'begin;\ncreate table t (id int);\ncommit;\n' },
      'transaction_control',
    ],
    [
      'a SAVEPOINT',
      { '0001_a.sql': 'create table t (id int);\nsavepoint s;\n' },
      'transaction_control',
    ],
    ['an END', { '0001_a.sql': 'create table t (id int);\nEND;\n' }, 'transaction_control'],
  ])('rejects %s', async (_, files, code) => {
    const loaded = await loadMigrations(await folderWith(files));
    expect(!loaded.ok && loaded.error.code).toBe(code);
  });

  it('says where the transaction control is', async () => {
    const loaded = await loadMigrations(
      await folderWith({ '0001_a.sql': '-- one\ncreate table t (id int);\n\n  rollback;\n' }),
    );
    expect(!loaded.ok && loaded.error.message).toContain('0001_a.sql line 4 has ROLLBACK');
  });

  it('allows BEGIN and END inside function bodies', async () => {
    const loaded = await loadMigrations(
      await folderWith({
        '0001_a.sql': [
          'create function f() returns int language plpgsql as $$ begin return 1; end $$;',
          'create function g() returns int language sql begin atomic select 1; end;',
          "do 'begin perform 1; end';",
        ].join('\n'),
      }),
    );
    expect(loaded.ok).toBe(true);
  });

  it('rejects a sub-folder', async () => {
    const folder = await folderWith({ '0001_a.sql': 'select 1;' });
    await mkdir(path.join(folder, 'old'));
    const loaded = await loadMigrations(folder);
    expect(!loaded.ok && loaded.error).toMatchObject({ code: 'unexpected_entry', file: 'old' });
  });

  it('rejects a symbolic link', async (context) => {
    const outside = await folderWith({ 'real.sql': 'select 1;' });
    const folder = await folderWith({});
    try {
      await symlink(path.join(outside, 'real.sql'), path.join(folder, '0001_a.sql'), 'file');
    } catch {
      // Windows allows symbolic links only with developer mode or as administrator.
      context.skip();
    }
    const loaded = await loadMigrations(folder);
    expect(!loaded.ok && loaded.error).toMatchObject({
      code: 'unexpected_entry',
      file: '0001_a.sql',
    });
  });

  it('reports a file it cannot read', async () => {
    const folder = await folderWith({ '0001_a.sql': 'select 1;' });
    const loaded = await loadMigrations(folder, () => Promise.reject(new Error('EACCES')));
    expect(!loaded.ok && loaded.error).toMatchObject({
      code: 'file_unreadable',
      file: '0001_a.sql',
    });
  });

  it('reports a folder it cannot read', async () => {
    const loaded = await loadMigrations(path.join(os.tmpdir(), 'no-such-migrations-folder-x9'));
    expect(!loaded.ok && loaded.error.code).toBe('folder_unreadable');
  });
});
