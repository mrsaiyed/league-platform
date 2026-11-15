// Where the tracker's project reference comes from (record 055): the repository's own
// supabase/site.json, found from the code's own file, never from the working folder
// or a site.json nearer the code. The folders in fixtures/ are made up.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { trackerProjectFor, trackerProjectOf } from './tracker-project.ts';

const fixture = (rel: string) => new URL(`./fixtures/${rel}`, import.meta.url).href;
const realSite = readFileSync(new URL('../../../../supabase/site.json', import.meta.url), 'utf8');
const startedIn = process.cwd();

afterEach(() => {
  process.chdir(startedIn);
});

describe('trackerProjectFor', () => {
  it('reads the repository’s own supabase/site.json, found from the code’s file', () => {
    const real = trackerProjectOf(realSite);
    expect(real).toMatch(/^[a-z0-9]{15,}$/);
    expect(trackerProjectFor(import.meta.url)).toBe(real);
  });

  it('takes only the site.json at the repository root, not one nearer the code', () => {
    // fixtures/repo/apps/web/supabase/site.json names another project: it is not read.
    expect(trackerProjectFor(fixture('repo/apps/web/src/server/config.ts'))).toBe(
      'abcdefghijklmnopqrst',
    );
  });

  it('is null when the repository has no site.json, whatever the working folder holds', () => {
    // The lane's own root has a site.json; working there changes nothing.
    process.chdir(fileURLToPath(new URL('../../../../', import.meta.url)));
    expect(trackerProjectFor(fixture('repo-without-site/apps/web/src/server/config.ts'))).toBe(
      null,
    );
  });

  it('ignores the working folder: started elsewhere, it still finds the repository’s file', () => {
    // A made-up folder with a site.json of another project, and no repository.
    process.chdir(fileURLToPath(new URL('./fixtures/no-repo/', import.meta.url)));
    expect(trackerProjectFor(import.meta.url)).toBe(trackerProjectOf(realSite));
  });

  it('never reads a site.json outside a repository on the way up', () => {
    // fixtures/no-repo/supabase/site.json is passed on the way to the lane's root.
    expect(trackerProjectFor(fixture('no-repo/src/config.ts'))).toBe(trackerProjectOf(realSite));
  });

  it('is null for an address that is not a file', () => {
    expect(trackerProjectFor('https://example.test/config.ts')).toBeNull();
  });
});

describe('trackerProjectOf', () => {
  it('reads the project reference only from a Supabase address', () => {
    expect(trackerProjectOf('{"url":"https://abcdefghijklmnopqrst.supabase.co"}')).toBe(
      'abcdefghijklmnopqrst',
    );
    for (const bad of [
      'not json',
      'null',
      '{}',
      '{"url":42}',
      '{"url":"not an address"}',
      '{"url":"https://short.supabase.co"}',
      '{"url":"https://abcdefghijklmnopqrst.example.test"}',
    ]) {
      expect(trackerProjectOf(bad)).toBeNull();
    }
  });
});
