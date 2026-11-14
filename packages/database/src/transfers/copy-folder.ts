// The reader's working copy of a backup (step 2.57), made quickly.
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

/** How many files are copied at the same time. */
const AT_ONCE = 8;

/** The folder held something that is neither a folder nor a plain file, such as a link. */
export class NotPlainFolderError extends Error {
  constructor(readonly entry: string) {
    super(`not a plain file or folder: ${entry}`);
    this.name = 'NotPlainFolderError';
  }
}

/**
 * Copies the folder `from`, with every folder and file in it, to `to`, which is made.
 *
 * A database folder holds about a thousand small files. Node's own `fs.promises.cp`
 * handles them one at a time with several checks each; on Windows, where every new file
 * is also scanned, that took 18 to 46 seconds against 2 to 6 for this (step 2.149), which
 * is what made the transfer tests run past their time limits.
 *
 * Anything that is neither a folder nor a plain file (a link, say) is refused before any
 * copying: the copy is opened as a database, and through a link it could write outside
 * itself, into the backup. The tracker's backups never hold one.
 *
 * It settles only once every copy it started has finished, so a caller that removes `to`
 * after a failure never races a copy still being written.
 */
export async function copyFolder(from: string, to: string): Promise<void> {
  const entries = await readdir(from, { recursive: true, withFileTypes: true });
  const folders: string[] = [];
  const files: string[] = [];
  for (const entry of entries) {
    const relative = path.relative(from, path.join(entry.parentPath, entry.name));
    if (entry.isDirectory()) folders.push(relative);
    else if (entry.isFile()) files.push(relative);
    else throw new NotPlainFolderError(relative);
  }
  await mkdir(to, { recursive: true });
  // `readdir` lists a folder before what is in it, so each parent is made first.
  for (const folder of folders) await mkdir(path.join(to, folder), { recursive: true });

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
}
