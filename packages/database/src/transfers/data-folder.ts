// Writes a made-up database's data folder: for the transfer tests (step 2.149), and for
// the made-up tracker backup the seed's demo-shaped league is transferred from (step 2.59).
//
// Building a database straight into a folder on disk is slow on Windows: PGlite writes
// each of its thousand-odd files a little at a time, and every write waits on the disk
// (19 to 29 seconds on a busy computer, against 5 to 9 in memory). So the tests build the
// database in memory and write its folder out once, file by file, from PGlite's own dump.
//
// A dump is taken while the database is open, so the folder it gives is that of a
// database still running: a `postmaster.pid` in it, and its control file saying "in
// production". A real backup (`npm run stats:copy`) is closed first. So the folder is
// then opened once and closed cleanly, and its shape checked: no `postmaster.pid`, and
// the control file saying "shut down".
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/** How many files are written at the same time. */
const AT_ONCE = 16;

/** Writes the data folder of the in-memory database `db` to `dir`, which is made. */
export async function writeDataFolder(db: PGlite, dir: string): Promise<void> {
  // Every change written into the data files, not left only in memory and the log.
  await db.exec('CHECKPOINT');
  const tar = new Uint8Array(await (await db.dumpDataDir('none')).arrayBuffer());
  await mkdir(dir, { recursive: true });
  // The dump's own permissions (0777, 0666) are those of PGlite's in-memory files, not of
  // a real data folder: PostgreSQL's own are used, 0700 for folders and 0600 for files
  // (on a file system that has permissions).
  const folders = [dir];
  const files: { file: string; bytes: Uint8Array }[] = [];
  for (const entry of tarEntries(tar)) {
    const target = path.join(dir, entry.name);
    if (path.relative(dir, target).startsWith('..')) throw new Error(`outside: ${entry.name}`);
    if (entry.kind === 'folder') {
      await mkdir(target, { recursive: true });
      folders.push(target);
    } else files.push({ file: target, bytes: entry.bytes });
  }
  // The folders are all made; the files can be written a few at a time.
  let next = 0;
  const writer = async () => {
    for (let one = files[next++]; one !== undefined; one = files[next++]) {
      await mkdir(path.dirname(one.file), { recursive: true });
      await writeFile(one.file, one.bytes, { mode: 0o600 });
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, writer));
  for (const folder of folders) await chmod(folder, 0o700);

  const closed = new PGlite(dir);
  await closed.waitReady;
  await closed.close();
  if (existsSync(path.join(dir, 'postmaster.pid'))) {
    throw new Error(`${dir} still holds postmaster.pid after a clean close`);
  }
  const state = await controlFileState(dir);
  if (state !== 'shut down') throw new Error(`${dir} was not shut down cleanly: ${state}`);
}

// PostgreSQL's DBState, the fourth field of global/pg_control (after the 8-byte system
// identifier and two 4-byte version numbers), as a little-endian 4-byte number.
const STATES = [
  'starting up',
  'shut down',
  'shut down in recovery',
  'shutting down',
  'in crash recovery',
  'in archive recovery',
  'in production',
] as const;

/** What a data folder's control file says the database's state was when last written. */
export async function controlFileState(dir: string): Promise<string> {
  const control = await readFile(path.join(dir, 'global', 'pg_control'));
  const state = control.readInt32LE(16);
  return STATES[state] ?? `unknown (${state})`;
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
