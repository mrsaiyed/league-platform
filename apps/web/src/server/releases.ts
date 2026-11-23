// THE ONE LIST OF WHAT IS RELEASED (step 2.140, T-157; record 087). Every page of our own,
// every page of a league and every area of the admin is named here, released or not built
// yet: T-100's rollout flag ("have we released it yet") in its simplest form, one value in
// code for every league. The two other questions of T-100 (is it in the league's agreement,
// has the league switched it on) are a feature's own and are not asked here.
//
// What the list changes is only what is drawn, never who may open what (the league gate,
// league-gate.ts, is the same in every mode):
// - In staging (the online test copy) and production a page that is not built yet does not
//   exist. It has no route of its own: it is drawn by the route that answers every unknown
//   address at its place (`[league]/(site)/page.tsx` for one word, `[league]/(site)/
//   [...missing]` below a league or one of our words, `[league]/admin/[...missing]` in the
//   admin; features/unreleased), and only where the mode shows unreleased
//   pages. Everywhere else that route goes on exactly as for an address that does not
//   exist, so the answer is the same, byte for byte but the date, and Next.js's list of the
//   routes beside an address never names it. No link, menu entry, button or list line that
//   leads to one is drawn (the admin's menu and home, the footer).
// - In local work and tests everything is drawn, as before: the placeholders, and the
//   admin's areas with no screen yet marked "Not ready". LOCAL_UNRELEASED=hidden draws them
//   as staging and production do, so a check on this computer sees what a live league shows.
//
// A page is released by building it: its own route file, and "released" here, in the same
// change. A page built but not to be shown yet stays "not-built" here and is drawn by its
// place's unknown-address route until it is (features/unreleased says how).
import type { AdminArea, LeaguePage, PlatformPage } from '@srleagues/core';
import { getConfig } from './config.ts';
import { runsOnMadeUpData } from './made-up-mode.ts';

/** Whether a page or area may be shown wherever the app runs, or only in local work. */
export type Release = 'released' | 'not-built';

/** Our own pages (platform-url.ts). */
export const platformPageReleases = {
  home: 'released',
  find: 'not-built',
  start: 'not-built',
  signin: 'released',
  forgotPassword: 'released',
  googleReturn: 'released',
  // The two local-only pages have a gate of their own (local-tools.ts, step 2.96), which
  // never opens outside local work and tests; nothing here can open it.
  keptEmails: 'released',
  madeUpPeople: 'released',
  signup: 'released',
  enterCode: 'released',
  choosePassword: 'released',
  account: 'released',
  confirmPassword: 'released',
  inbox: 'not-built',
  help: 'not-built',
  contact: 'not-built',
  status: 'not-built',
  privacy: 'released',
  terms: 'released',
} as const satisfies Record<PlatformPage, Release>;

/** A league's pages (league-url.ts). The admin's areas are in the list below. */
export const leaguePageReleases = {
  home: 'released',
  schedule: 'released',
  standings: 'released',
  stats: 'released',
  teams: 'released',
  team: 'released',
  player: 'not-built',
  game: 'released',
  register: 'not-built',
  my: 'released',
  news: 'not-built',
  'news-post': 'not-built',
  awards: 'not-built',
  draft: 'not-built',
  media: 'not-built',
  sponsors: 'not-built',
  club: 'not-built',
  page: 'not-built',
  admin: 'released',
  'admin-area': 'released',
  score: 'released',
  // Accepting an invitation: the email's link and the page it leads to (step 2.97).
  invitation: 'released',
  'invitation-held': 'released',
} as const satisfies Record<LeaguePage, Release>;

/** The admin's areas (league-url.ts), in the menu's order. Its home is always there. */
export const adminAreaReleases = {
  registration: 'not-built',
  people: 'released',
  teams: 'released',
  schedule: 'released',
  games: 'released',
  standings: 'not-built',
  site: 'not-built',
  messages: 'not-built',
  season: 'released',
  settings: 'released',
} as const satisfies Record<AdminArea, Release>;

/** What may be drawn here: a page, a league's page or an area that is released, or all. */
export type Shown = {
  /** True when everything is drawn, pages not built yet included (local work and tests). */
  readonly unreleased: boolean;
  readonly platformPage: (page: PlatformPage) => boolean;
  readonly leaguePage: (page: LeaguePage) => boolean;
  readonly adminArea: (area: AdminArea) => boolean;
};

/** What is drawn when `unreleased` pages are, or only what is released. */
export function shownWhen(unreleased: boolean): Shown {
  return {
    unreleased,
    platformPage: (page) => unreleased || platformPageReleases[page] === 'released',
    leaguePage: (page) => unreleased || leaguePageReleases[page] === 'released',
    adminArea: (area) => unreleased || adminAreaReleases[area] === 'released',
  };
}

/** The app's own settings this reads: the mode, and the local choice. */
export type ReleaseSettings = {
  readonly APP_ENV: string;
  readonly LOCAL_UNRELEASED?: 'shown' | 'hidden' | undefined;
};

/**
 * Whether pages not built yet are drawn: in local work and tests unless LOCAL_UNRELEASED
 * is `hidden`; never in staging or production, whatever else is set. Decided from the
 * server's own settings, never from anything a request carries.
 */
export function showsUnreleased(settings: ReleaseSettings): boolean {
  return runsOnMadeUpData(settings.APP_ENV) && settings.LOCAL_UNRELEASED !== 'hidden';
}

/** What this server draws, from its settings (config.ts). */
export function shownHere(): Shown {
  return shownWhen(showsUnreleased(getConfig()));
}

/** Whether an area of the admin has a screen of its own (it is "released"). */
export const isReadyArea = (area: AdminArea): boolean => adminAreaReleases[area] === 'released';
