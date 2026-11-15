// The account button (U-8, step 2.127): what it holds for each person, that it leads to
// no page not built yet, and that a visitor's header holds nothing of anyone signed in.
import { en } from '@srleagues/site';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AdminArea } from '@srleagues/core';
import type { LeagueView } from '../../server/league-gate.ts';
import { waitingQuestionText } from '../tracker/index.ts';
import {
  accountMenuOf,
  isScoringPage,
  signInHrefFrom,
  waitingQuestionWords,
} from './account-menu.ts';
import { SiteHeader } from './site-header.tsx';

const league = { id: '01900000-0000-7000-8000-000000000001', slug: 'north-valley', status: 'live' };
const signedIn = {
  accountId: '01900000-0000-7000-8000-0000000000a1',
  sessionId: 's',
  hasPassword: true,
  passwordEnteredAt: null,
  lastSignInAt: new Date('2026-11-01T10:00:00Z'),
};
const viewOf = (
  areas: readonly AdminArea[],
  mayScore: boolean,
  account: typeof signedIn | null = signedIn,
): LeagueView => ({
  context: { kind: 'league', requestId: 'r', account, league: { ...league, status: 'live' } },
  areas,
  runsTheLeague: areas.length > 0,
  mayScore,
});
const everyArea: readonly AdminArea[] = ['people', 'teams', 'schedule', 'games', 'settings'];

describe('accountMenuOf', () => {
  it('gives a visitor no account button', () => {
    expect(accountMenuOf(viewOf([], false, null), null, '/north-valley')).toBeNull();
    expect(
      accountMenuOf(viewOf([], false, null), 'someone@example.test', '/north-valley'),
    ).toBeNull();
  });

  it('gives the owner the admin and the games area', () => {
    expect(accountMenuOf(viewOf(everyArea, true), 'olive@example.test', '/north-valley')).toEqual({
      initial: 'O',
      email: 'olive@example.test',
      adminHref: '/north-valley/admin',
      gamesHref: '/north-valley/admin/games',
      accountHref: '/account',
      onScoringPage: false,
    });
  });

  it('gives a scorekeeper their games, which are their admin home, and no second "Admin"', () => {
    const menu = accountMenuOf(viewOf(['games'], true), 'sam@example.test', '/north-valley');
    expect(menu?.adminHref).toBeNull();
    expect(menu?.gamesHref).toBe('/north-valley/admin');
  });

  it('gives a scheduler the admin and no games, a coach or a player neither', () => {
    const scheduler = accountMenuOf(
      viewOf(['schedule'], false),
      'sky@example.test',
      '/north-valley',
    );
    expect([scheduler?.adminHref, scheduler?.gamesHref]).toEqual(['/north-valley/admin', null]);
    const coach = accountMenuOf(viewOf([], false), 'cat@example.test', '/north-valley');
    expect([coach?.adminHref, coach?.gamesHref]).toEqual([null, null]);
    expect(coach?.accountHref).toBe('/account');
  });

  it('brings a visitor back to the page they were on, never off the site', () => {
    expect(signInHrefFrom('/north-valley/schedule?team=owls')).toBe(
      '/signin?next=%2Fnorth-valley%2Fschedule%3Fteam%3Dowls',
    );
    expect(signInHrefFrom('//elsewhere.example/x')).toBe('/signin');
    expect(signInHrefFrom('https://elsewhere.example/x')).toBe('/signin');
  });

  it("knows a game's scoring page, and no other page, by its address", () => {
    const game = '/north-valley/score/01900000-0000-7000-8000-006a00000002';
    expect(isScoringPage(league, game)).toBe(true);
    expect(isScoringPage(league, `${game}?x=1`)).toBe(true);
    expect(isScoringPage(league, game.toUpperCase())).toBe(true);
    for (const other of [
      '/north-valley',
      '/north-valley/score',
      '/north-valley/score/',
      '/north-valley/admin',
      '/harbor-city/score/x',
    ]) {
      expect(isScoringPage(league, other), other).toBe(false);
    }
    expect(accountMenuOf(viewOf(['games'], true), 'sam@example.test', game)?.onScoringPage).toBe(
      true,
    );
  });
});

describe('signing out on the scoring page', () => {
  const scorer = accountMenuOf(
    viewOf(['games'], true),
    'sam@example.test',
    '/north-valley/score/01900000-0000-7000-8000-006a00000002',
  );
  it('is a link to the account page, as the tracker’s own way out is, with scripts off', () => {
    const html = renderToStaticMarkup(
      createElement(SiteHeader, {
        league,
        name: 'North Valley League',
        account: scorer,
        signInHref: '/signin',
      }),
    );
    expect(html).toContain(
      `<a class="site-account-sign-out" href="/account">${en['account.signOut']}</a>`,
    );
    expect(html).not.toContain(`>${en['account.signOut']}</button>`);
  });

  it('asks in the message file’s words, with the number of plays', () => {
    const words = waitingQuestionWords();
    expect(waitingQuestionText(words, 3)).toBe(
      '3 plays are not sent yet. They stay on this device and are sent when you sign in again. Sign out?',
    );
    expect(waitingQuestionText(words, 1)).toBe(
      '1 play is not sent yet. It stays on this device and is sent when you sign in again. Sign out?',
    );
  });
});

describe('the account button in the header', () => {
  const owner = accountMenuOf(viewOf(everyArea, true), 'olive@example.test', '/north-valley');
  const signInHref = '/signin?next=%2Fnorth-valley';
  const header = (account: typeof owner) =>
    renderToStaticMarkup(
      createElement(SiteHeader, { league, name: 'North Valley League', account, signInHref }),
    );

  it('shows a signed-in person who they are, and their four ways on, in both places', () => {
    const html = header(owner);
    const phone = html.slice(html.indexOf('class="site-menu-panel"'), html.indexOf('</details>'));
    const wide = html.slice(
      html.indexOf('class="site-account"'),
      html.indexOf('class="site-tabs"'),
    );
    for (const part of [phone, wide]) {
      expect(part).toContain('Signed in as olive@example.test');
      expect(part).toContain(`href="/north-valley/admin">${en['account.menu.admin']}</a>`);
      expect(part).toContain(`href="/north-valley/admin/games">${en['account.menu.myGames']}</a>`);
      expect(part).toContain(`href="/account">${en['account.menu.account']}</a>`);
      expect(part).toContain(`>${en['account.signOut']}</button>`);
    }
    // The button: the initial, and a name for a screen reader.
    expect(wide).toMatch(
      /<summary><span class="site-account-initial" aria-hidden="true">O<\/span>/,
    );
    expect(wide).toContain(`<span class="ui-visually-hidden">${en['account.menu']}</span>`);
    expect(html).not.toContain(en['account.signInOrCreate']);
    expect(html).not.toContain(en['shell.notBuilt']);
  });

  it("holds nothing of a signed-in person in a visitor's header", () => {
    const html = header(null);
    expect(html).toContain(`href="${signInHref.replace(/&/g, '&amp;')}"`);
    for (const trace of [
      'olive@example.test',
      'site-account',
      en['account.menu.admin'],
      en['account.menu.myGames'],
      en['account.menu.account'],
      en['account.signOut'],
      'Signed in as',
      '/admin',
    ]) {
      expect(html).not.toContain(trace);
    }
  });

  it('keeps everything in the account button 44 high, from the frame’s own scales', () => {
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const selector of [
      '.site-header .site-account-sign-out',
      '.site-account > summary',
      '.site-header .site-account-panel li a',
    ]) {
      const rule = css.split(`${selector} {`)[1] ?? '';
      expect(rule.slice(0, rule.indexOf('}')), selector).toMatch(/min-block-size: var\(--tap\);/);
    }
    // Hidden on a phone, where the entries are in the menu's panel; shown from a tablet up.
    const phone = css.slice(0, css.indexOf('@media (min-width: 48rem)'));
    expect(phone).toMatch(/\n\.site-account \{\s*display: none;/);
    expect(css.slice(phone.length)).toMatch(
      /\.site-account \{\s*position: relative;\s*display: block;/,
    );
  });
});
