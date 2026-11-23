// The one list of what is released (step 2.140, record 087): which modes draw pages not
// built yet, and that no page not built yet has a route of its own, so that outside local
// work it can only be answered by its place's unknown-address route, exactly as an address
// that does not exist.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  adminAreas,
  leaguePages,
  platformPages,
  type AdminArea,
  type LeaguePage,
  type PlatformPage,
} from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config-schema.ts';
import {
  adminAreaReleases,
  isReadyArea,
  leaguePageReleases,
  platformPageReleases,
  shownWhen,
  showsUnreleased,
} from './releases.ts';

const local = {
  PUBLIC_BASE_URL: 'http://localhost:3000',
  EMAIL_FROM: 'hello@example.test',
};
const hosted = {
  PUBLIC_BASE_URL: 'https://leagues.example.test',
  EMAIL_FROM: 'hello@example.test',
  TRUSTED_PROXY: 'one',
  PLATFORM_DATABASE_URL: 'postgres://app:made-up-password@localhost:5432/league_local',
  SUPABASE_URL: 'https://made-up-project.supabase.example.test',
  SUPABASE_SECRET_KEY: 'made-up-supabase-key',
  RESEND_API_KEY: 'made-up-resend-key',
  TURNSTILE_SITE_KEY: 'made-up-turnstile-site-key',
  TURNSTILE_SECRET_KEY: 'made-up-turnstile-secret-key',
};

describe('which modes draw pages not built yet', () => {
  it('local work and tests draw everything, unless LOCAL_UNRELEASED is hidden', () => {
    for (const APP_ENV of ['local', 'test']) {
      expect(showsUnreleased(loadConfig({ ...local, APP_ENV }))).toBe(true);
      expect(showsUnreleased(loadConfig({ ...local, APP_ENV, LOCAL_UNRELEASED: 'shown' }))).toBe(
        true,
      );
      expect(showsUnreleased(loadConfig({ ...local, APP_ENV, LOCAL_UNRELEASED: 'hidden' }))).toBe(
        false,
      );
    }
  });

  it('staging and production never do, whatever is asked of them', () => {
    for (const APP_ENV of ['staging', 'production']) {
      expect(showsUnreleased(loadConfig({ ...hosted, APP_ENV }))).toBe(false);
      // The real settings refuse the local choice there; asked anyway, it changes nothing.
      expect(showsUnreleased({ APP_ENV, LOCAL_UNRELEASED: 'shown' })).toBe(false);
    }
    expect(showsUnreleased({ APP_ENV: 'anything-else' })).toBe(false);
  });

  it('with them hidden, only what the list releases is drawn; shown, everything is', () => {
    const hidden = shownWhen(false);
    const all = shownWhen(true);
    for (const page of Object.keys(platformPages) as PlatformPage[]) {
      expect(hidden.platformPage(page), page).toBe(platformPageReleases[page] === 'released');
      expect(all.platformPage(page), page).toBe(true);
    }
    for (const page of Object.keys(leaguePages) as LeaguePage[]) {
      expect(hidden.leaguePage(page), page).toBe(leaguePageReleases[page] === 'released');
      expect(all.leaguePage(page), page).toBe(true);
    }
    for (const area of adminAreas) {
      expect(hidden.adminArea(area), area).toBe(adminAreaReleases[area] === 'released');
      expect(hidden.adminArea(area), area).toBe(isReadyArea(area));
      expect(all.adminArea(area), area).toBe(true);
    }
    expect(hidden.unreleased).toBe(false);
    expect(all.unreleased).toBe(true);
  });

  it('names the areas with a screen today, and the pages that are placeholders', () => {
    expect(adminAreas.filter(isReadyArea)).toEqual([
      'people',
      'teams',
      'schedule',
      'games',
      'season',
      'settings',
    ]);
    const notBuilt = <K extends string>(list: Readonly<Record<K, string>>) =>
      Object.entries(list)
        .filter(([, release]) => release === 'not-built')
        .map(([name]) => name)
        .sort();
    expect(notBuilt(platformPageReleases)).toEqual([
      'contact',
      'find',
      'help',
      'inbox',
      'start',
      'status',
    ]);
    expect(notBuilt(leaguePageReleases)).toEqual([
      'awards',
      'club',
      'draft',
      'invitation',
      'media',
      'news',
      'news-post',
      'page',
      'player',
      'register',
      'sponsors',
    ]);
  });
});

describe('the routes', () => {
  const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');

  /** Every page or endpoint file under app/, as its address's segments (groups left out). */
  function routes(dir: string = app, segments: readonly string[] = []): string[][] {
    const found: string[][] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const group = /^\(.+\)$/.test(entry.name);
        found.push(
          ...routes(path.join(dir, entry.name), group ? segments : [...segments, entry.name]),
        );
      } else if (/^(page|route)\.(tsx?|jsx?)$/.test(entry.name)) {
        found.push([...segments]);
      }
    }
    return found;
  }

  /** A route of this address's own: each word the same, each `:value` a `[value]` folder. */
  const ownRoute = (route: readonly string[], address: readonly string[]) =>
    route.length === address.length &&
    route.every((part, at) => {
      const asked = address[at] ?? '';
      if (asked.startsWith(':')) return /^\[[^.[\]]+\]$/.test(part);
      return part === asked;
    });

  const all = routes();
  const routeOf = (address: readonly string[]) => all.filter((r) => ownRoute(r, address));

  it('no page that is not built yet has a route of its own', () => {
    const found: string[] = [];
    for (const [page, release] of Object.entries(platformPageReleases)) {
      const address = platformPages[page as PlatformPage];
      if (release === 'not-built' && routeOf(address).length > 0) found.push(`/${page}`);
    }
    for (const [page, release] of Object.entries(leaguePageReleases)) {
      const address = [':league', ...leaguePages[page as LeaguePage].path];
      if (release === 'not-built' && routeOf(address).length > 0) found.push(`league ${page}`);
    }
    for (const [area, release] of Object.entries(adminAreaReleases)) {
      const address = [':league', 'admin', area];
      if (release === 'not-built' && routeOf(address).length > 0) found.push(`admin ${area}`);
    }
    expect(found).toEqual([]);
  });

  // The list is the one place (step 2.140): an area of the admin built with a route of its
  // own but left out of the list, or left "not-built" there, would be missing from the menu
  // of a live league. This fails until the area is named in adminAreaReleases as released.
  it('every folder of the admin is an area the list names and releases', () => {
    const named: readonly string[] = adminAreas;
    const folders = [
      ...new Set(
        all
          .filter((r) => r[0] === '[league]' && r[1] === 'admin' && r.length > 2)
          .map((r) => r[2] ?? '')
          .filter((folder) => !folder.startsWith('[')),
      ),
    ].sort();
    expect(folders.length).toBeGreaterThan(0);
    for (const folder of folders) {
      expect(named, `admin/${folder} is not an area of the list`).toContain(folder);
      expect(adminAreaReleases[folder as AdminArea], `admin/${folder}`).toBe('released');
    }
  });

  it('every area of the admin that is released has its route, and so do the released pages', () => {
    for (const area of adminAreas.filter((a: AdminArea) => isReadyArea(a))) {
      expect(routeOf([':league', 'admin', area]), area).toHaveLength(1);
    }
    for (const [page, release] of Object.entries(leaguePageReleases)) {
      // An admin area's address is the area's own (above), not a route of `[area]`.
      if (release !== 'released' || page === 'admin-area') continue;
      const address = [':league', ...leaguePages[page as LeaguePage].path];
      expect(routeOf(address), page).toHaveLength(1);
    }
    for (const [page, release] of Object.entries(platformPageReleases)) {
      // The two local-only pages are answered by the unknown-address route (step 2.96).
      if (release !== 'released' || page === 'keptEmails' || page === 'madeUpPeople') continue;
      expect(routeOf(platformPages[page as PlatformPage]), page).toHaveLength(1);
    }
  });
});
