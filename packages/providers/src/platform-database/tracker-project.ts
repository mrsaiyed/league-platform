// The tracker's Supabase project reference, which the tracker's database guard checks
// the platform's settings against (record 055). It comes from the repository's own
// supabase/site.json, found from the calling code's own file, never from the working
// folder: the app may be started from anywhere, and a site.json found there could be
// any file. Reads one file; opens no address.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The project reference in supabase/site.json's text (`https://{ref}.supabase.co`),
 * or null for anything else. Reads text only; never opens the address.
 */
export function trackerProjectOf(siteJson: string): string | null {
  let url: unknown;
  try {
    url = (JSON.parse(siteJson) as { url?: unknown } | null)?.url;
  } catch {
    return null;
  }
  if (typeof url !== 'string' || !URL.canParse(url)) return null;
  const ref = /^([a-z0-9]{15,})\.supabase\.co$/.exec(new URL(url).hostname)?.[1];
  return ref ?? null;
}

/** How far up from the code's own folder the repository root is looked for. */
const mostLevels = 10;

/**
 * The tracker's project reference from the repository's supabase/site.json, or null
 * when it is not there or names no Supabase project. `codeUrl` is the caller's own
 * `import.meta.url`. The repository is the first folder above that file whose
 * package.json lists the workspaces; only its supabase/site.json counts, so no other
 * site.json on the way up, or beside the working folder, is ever read.
 */
export function trackerProjectFor(codeUrl: string): string | null {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(codeUrl));
  } catch {
    return null;
  }
  for (let level = 0; level < mostLevels; level += 1) {
    if (isRepositoryRoot(dir)) {
      const file = path.join(dir, 'supabase', 'site.json');
      return existsSync(file) ? trackerProjectOf(readFileSync(file, 'utf8')) : null;
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return null;
}

function isRepositoryRoot(dir: string): boolean {
  const file = path.join(dir, 'package.json');
  if (!existsSync(file)) return false;
  try {
    const manifest: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return (
      typeof manifest === 'object' &&
      manifest !== null &&
      Array.isArray((manifest as { workspaces?: unknown }).workspaces)
    );
  } catch {
    return false;
  }
}
