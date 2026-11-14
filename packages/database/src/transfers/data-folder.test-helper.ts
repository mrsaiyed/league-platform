// Writes a made-up database's data folder for the transfer tests (step 2.149).
//
// Building a database straight into a folder on disk is slow on Windows: PGlite writes
// each of its thousand-odd files a little at a time, and every write waits on the disk
// (19 to 29 seconds on a busy computer, against 5 to 9 in memory). So the tests build the
// database in memory and write its folder out once, file by file, from PGlite's own dump.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/** Writes the data folder of the in-memory database `db` to `dir`, which is made. */
export async function writeDataFolder(db: PGlite, dir: string): Promise<void> {
  // Every change written into the data files, not left only in memory and the log.
  await db.exec('CHECKPOINT');
  const tar = new Uint8Array(await (await db.dumpDataDir('none')).arrayBuffer());
  await mkdir(dir, { recursive: true });
  const files: { file: string; bytes: Uint8Array }[] = [];
  for (const entry of tarEntries(tar)) {
    const target = path.join(dir, entry.name);
    if (path.relative(dir, target).startsWith('..')) throw new Error(`outside: ${entry.name}`);
    if (entry.kind === 'folder') await mkdir(target, { recursive: true });
    else files.push({ file: target, bytes: entry.bytes });
  }
  // The folders are all made; the files can be written side by side.
  await Promise.all(
    files.map(async ({ file, bytes }) => {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
    }),
  );
}

type TarEntry =
  | { kind: 'folder'; name: string }
  | { kind: 'file'; name: string; bytes: Uint8Array };

/** The entries of a plain (ustar) tar archive, the format of PGlite's dump. */
function* tarEntries(tar: Uint8Array): Generator<TarEntry> {
  const text = (at: number, length: number) => {
    const field = tar.subarray(at, at + length);
    const end = field.indexOf(0);
    return new TextDecoder().decode(end < 0 ? field : field.subarray(0, end));
  };
  for (let at = 0; at + 512 <= tar.length; ) {
    const short = text(at, 100);
    if (short === '') return;
    const prefix = text(at + 345, 155);
    const name = prefix === '' ? short : `${prefix}/${short}`;
    const size = Number.parseInt(text(at + 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(tar[at + 156] ?? 0);
    if (type === '5') yield { kind: 'folder', name };
    else if (type === '0' || type === '\0') {
      yield { kind: 'file', name, bytes: tar.subarray(at + 512, at + 512 + size) };
    } else throw new Error(`a tar entry of type ${type} is not expected: ${name}`);
    at += 512 + Math.ceil(size / 512) * 512;
  }
}
