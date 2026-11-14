import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotPlainFolderError, copyFolder } from './copy-folder.ts';

let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'copy-folder-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

/** Every folder and file under `dir`, with each file's bytes. */
async function contents(dir: string) {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    const file = path.join(entry.parentPath, entry.name);
    const key = path.relative(dir, file).split(path.sep).join('/');
    out[key] = entry.isFile() ? (await readFile(file)).toString('base64') : '(folder)';
  }
  return out;
}

describe('copyFolder', () => {
  it('copies every folder and file, byte for byte, and leaves the original as it was', async () => {
    const from = path.join(root, 'from');
    await mkdir(path.join(from, 'base', '1'), { recursive: true });
    await mkdir(path.join(from, 'pg_wal', 'empty'), { recursive: true });
    await writeFile(path.join(from, 'PG_VERSION'), '17\n');
    await writeFile(path.join(from, 'empty-file'), '');
    await writeFile(path.join(from, 'base', '1', '1259'), Buffer.from([0, 1, 2, 255, 254]));
    // More files than are copied at once.
    for (let i = 0; i < 40; i += 1) await writeFile(path.join(from, 'base', `f${i}`), `file ${i}`);
    const before = await contents(from);

    const to = path.join(root, 'to', 'not-yet-made');
    await copyFolder(from, to);

    expect(await contents(to)).toEqual(before);
    expect(await contents(from)).toEqual(before);
    expect(Object.keys(before)).toContain('pg_wal/empty');
  });

  it('refuses a folder that holds a link, before copying anything', async () => {
    const from = path.join(root, 'linked');
    const elsewhere = path.join(root, 'elsewhere');
    await mkdir(path.join(from, 'base'), { recursive: true });
    await mkdir(elsewhere);
    await writeFile(path.join(from, 'PG_VERSION'), '17\n');
    // A junction needs no special right on Windows; elsewhere it is an ordinary link.
    await symlink(elsewhere, path.join(from, 'base', 'link'), 'junction');

    const to = path.join(root, 'linked-copy');
    const error = await copyFolder(from, to).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotPlainFolderError);
    expect((error as NotPlainFolderError).entry).toBe(path.join('base', 'link'));
    expect(existsSync(to)).toBe(false);
  });

  it('fails when a file cannot be copied, and stops copying the rest', async () => {
    const from = path.join(root, 'blocked');
    await mkdir(from);
    for (let i = 0; i < 200; i += 1) await writeFile(path.join(from, `f${i}`), `file ${i}`);
    // A folder where the first file should go: that file cannot be written.
    const to = path.join(root, 'blocked-copy');
    await mkdir(path.join(to, 'f0'), { recursive: true });

    await expect(copyFolder(from, to)).rejects.toThrow();
    // The copiers stop at the first failure: of the 199 files that could be copied,
    // most never are.
    const copied = (await readdir(to, { withFileTypes: true })).filter((e) => e.isFile());
    expect(copied.length).toBeLessThan(199);
  });
});
