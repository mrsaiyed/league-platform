// The reader's working copy of a backup (step 2.57), made quickly.
import { chmod, copyFile, lstat, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

/** How many files are copied at the same time. */
const AT_ONCE = 8;

/** The folder held a link, or something that is neither a file, a folder nor a link. */
export class NotPlainFolderError extends Error {
  // Fields declared and set by hand, not as `constructor(readonly …)`: Node runs this
  // package's TypeScript itself (the web server loads it at run time) and refuses that
  // form (structure rule NODE-TS).
  readonly entry: string;
  readonly kind: 'link' | 'other';

  constructor(entry: string, kind: 'link' | 'other') {
    super(
      kind === 'link'
        ? `a link (lstat calls it a symbolic link), not a file or folder: ${entry}`
        : `neither a file, a folder nor a link (a socket or device, say): ${entry}`,
    );
    this.name = 'NotPlainFolderError';
    this.entry = entry;
    this.kind = kind;
  }
}

/**
 * Copies the folder `from`, with every folder and file in it, to `to`, which is made.
 *
 * A database folder holds about a thousand small files. Node's own `fs.promises.cp`
 * handles them one at a time with several checks each; on this Windows computer that
 * took 18 to 46 seconds against 2 to 6 for this (step 2.149).
 *
 * A link is refused before any copying: the copy is opened as a database, and through a
 * link it could write outside itself, into the backup. So is anything that is neither a
 * file, a folder nor a link (a socket, a device). The tracker's backups hold neither.
 * The kind of each entry is what `lstat` says whenever `readdir` does not call it a plain
 * file or folder: on Windows `readdir` can report a special entry (a synced folder's
 * placeholder, say) as something else, and such an entry is copied as what it is.
 *
 * It settles only once every copy it started has finished, so a caller that removes `to`
 * after a failure never races a copy still being written.
 */
export async function copyFolder(from: string, to: string): Promise<void> {
  const folders: string[] = [];
  const files: string[] = [];
  // Each folder's permissions, kept in the copy (PostgreSQL wants its folder private on
  // a file system that has permissions); each file's are kept by copyFile.
  const modes = new Map<string, number>([['', (await lstat(from)).mode & 0o777]]);
  const walk = async (relative: string): Promise<void> => {
    for (const entry of await readdir(path.join(from, relative), { withFileTypes: true })) {
      const inner = path.join(relative, entry.name);
      if (entry.isFile()) {
        files.push(inner);
        continue;
      }
      const stats = await lstat(path.join(from, inner));
      if (stats.isSymbolicLink()) throw new NotPlainFolderError(inner, 'link');
      if (stats.isFile()) files.push(inner);
      else if (stats.isDirectory()) {
        folders.push(inner);
        modes.set(inner, stats.mode & 0o777);
        await walk(inner);
      } else throw new NotPlainFolderError(inner, 'other');
    }
  };
  await walk('');
  await mkdir(to, { recursive: true });
  // Each folder is listed before what is in it, so each parent is made first.
  for (const folder of folders) await mkdir(path.join(to, folder));

  // In name order, whatever order the disk lists them in.
  files.sort();
  let next = 0;
  let failed = false;
  const copier = async () => {
    while (!failed && next < files.length) {
      const file = files[next++] as string;
      try {
        await copyFile(path.join(from, file), path.join(to, file));
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const done = await Promise.allSettled(Array.from({ length: AT_ONCE }, copier));
  const problem = done.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (problem) throw problem.reason as Error;
  // Once every file is in: each folder as private as its original, but always the
  // owner's to write and remove, or the copy could be neither opened nor cleaned up.
  for (const [folder, mode] of modes) await chmod(path.join(to, folder), mode | 0o700);
}
