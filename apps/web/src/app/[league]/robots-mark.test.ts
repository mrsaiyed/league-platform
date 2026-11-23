// One robots mark per league, set by this folder's layout.tsx only (step 2.60, U-18, T-312).
// Next.js merges a page's metadata into its layouts' shallowly: a page or a nested layout
// under a league that set `robots` of its own would replace the league's "do not index"
// on that page, silently, and a child's name could reach a search engine. So no file here
// but the league layout names robots at all.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const folder = fileURLToPath(new URL('.', import.meta.url));

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(at);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [at] : [];
  });
}

describe("a league's robots mark (step 2.60)", () => {
  it('is set by the league layout alone', () => {
    const files = sourcesUnder(folder).map((file) => relative(folder, file).split('\\').join('/'));
    expect(files).toContain('layout.tsx');
    const naming = files.filter(
      (file) =>
        file !== 'layout.tsx' &&
        /robots|leagueKeepOut/i.test(readFileSync(join(folder, file), 'utf8')),
    );
    expect(
      naming,
      'These files under app/[league] set or name `robots` in their metadata. Next.js merges ' +
        "metadata shallowly, so a page's own `robots` replaces the league's do-not-index mark " +
        'from app/[league]/layout.tsx on that page. Leave robots to the layout; a real need ' +
        "(a page that must ask for more) goes into core's readSiteFacts or " +
        'server/league-search-marks.ts, which the layout reads for every page.',
    ).toEqual([]);
  });
});
