// "You do not have access" for the person who is looking (step 2.157): the words are true
// for their case, the ways on are theirs, nobody signed in is offered "Sign in", and the
// screen names no league that may not be shown to them, nor any area or role.
import { en } from '@srleagues/site';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AdminArea } from '@srleagues/core';
import type { LeagueView } from '../../server/league-gate.ts';
import { RefusalPage } from './refusal-page.tsx';
import { refusalScreenOf } from './refusal-screen.ts';

const league = { id: '01900000-0000-7000-8000-000000000001', slug: 'north-valley', status: 'live' };
const signedIn = {
  accountId: '01900000-0000-7000-8000-0000000000a2',
  sessionId: 's',
  hasPassword: true,
  passwordEnteredAt: null,
  lastSignInAt: new Date('2026-11-01T10:00:00Z'),
};
const viewOf = (areas: readonly AdminArea[], account: typeof signedIn | null = signedIn) =>
  ({
    context: { kind: 'league', requestId: 'r', account, league: { ...league, status: 'live' } },
    areas,
    runsTheLeague: areas.length > 0,
    mayScore: areas.includes('games'),
  }) satisfies LeagueView;
const path = '/north-valley/admin/people';
const email = 'sky@example.test';
const name = 'North Valley League';
const drawn = (screen: ReturnType<typeof refusalScreenOf>) =>
  renderToStaticMarkup(createElement(RefusalPage, { screen }));
const keys = (screen: ReturnType<typeof refusalScreenOf>) => screen.says.map((s) => s.key);
const ways = (screen: ReturnType<typeof refusalScreenOf>) =>
  [screen.action, ...screen.also].map((way) => [way.label, way.href]);

describe('refusalScreenOf', () => {
  it('tells staff their own role, that it does not include the page, and leads to the admin', () => {
    const screen = refusalScreenOf({
      email,
      view: viewOf(['schedule']),
      leagueName: name,
      path,
      roles: ['scheduler'],
    });
    expect(screen.kind).toBe('staff');
    expect(keys(screen)).toEqual([
      'access.noAccess.youAre',
      'access.noAccess.notYourRole',
      'access.noAccess.signedInAs',
    ]);
    expect(ways(screen)).toEqual([
      ['admin.backToAdmin', '/north-valley/admin'],
      ['access.noAccess.backToLeague', '/north-valley?start=league'],
      ['access.noAccess.switch', '/signin?next=%2Fnorth-valley%2Fadmin%2Fpeople'],
    ]);
    const html = drawn(screen);
    expect(html).toContain('You are a scheduler in this league.');
    expect(html).toContain(
      'Your role in this league does not include this page. If it should, ask the league&#x27;s owner or an admin.',
    );
    expect(html).toContain('You are signed in as sky@example.test.');
    expect(html).toContain('Back to North Valley League');
    // One clear way on, filled; the others quiet beneath it.
    expect(html.match(/data-kind="main"/g)).toHaveLength(1);
    expect(html.match(/data-kind="quiet"/g)).toHaveLength(2);
  });

  it('tells a scorekeeper the same, and their admin is their games', () => {
    const screen = refusalScreenOf({ email, view: viewOf(['games']), leagueName: name, path });
    expect(screen.kind).toBe('staff');
    expect(screen.action.href).toBe('/north-valley/admin');
  });

  it('names both roles of someone who holds two, plainly', () => {
    const html = drawn(
      refusalScreenOf({
        email,
        view: viewOf(['schedule', 'games']),
        leagueName: name,
        path,
        roles: ['scheduler', 'coach'],
      }),
    );
    expect(html).toContain('You are a scheduler and a coach in this league.');
  });

  it('tells anyone else signed in that the page is for the people who run the league', () => {
    // A coach, a member or a stranger: no area of the admin here.
    const screen = refusalScreenOf({ email, view: viewOf([]), leagueName: name, path });
    expect(screen.kind).toBe('outsider');
    expect(keys(screen)).toEqual(['access.noAccess.notStaff', 'access.noAccess.signedInAs']);
    expect(ways(screen)).toEqual([
      ['access.noAccess.backToLeague', '/north-valley?start=league'],
      ['access.noAccess.switch', '/signin?next=%2Fnorth-valley%2Fadmin%2Fpeople'],
    ]);
    const html = drawn(screen);
    expect(html).toContain(
      'This page is for the people who run North Valley League. If you should be one of them, ask the league&#x27;s owner or an admin.',
    );
    expect(html).not.toContain('Back to the admin');
    // A coach is not told their role: nothing of roles is said to anyone outside the staff.
    const coach = drawn(
      refusalScreenOf({ email, view: viewOf([]), leagueName: name, path, roles: ['coach'] }),
    );
    expect(coach).not.toContain('coach');
  });

  it('offers nobody signed in "Sign in", and names no role or area but the person’s own', () => {
    const cases = [
      [[], []],
      [['schedule', 'games'], ['scheduler']],
      [['games'], ['scorekeeper']],
    ] as const;
    for (const [areas, own] of cases) {
      const html = drawn(
        refusalScreenOf({ email, view: viewOf(areas), leagueName: name, path, roles: own }),
      );
      expect(html).not.toMatch(/>Sign in</);
      expect(html).not.toContain('/signin"');
      const others = ['admin', 'registrar', 'scheduler', 'editor', 'scorekeeper', 'club admin']
        .map((role) => `a ${role}`)
        .filter((phrase) => !own.some((role) => phrase === `a ${role}`));
      for (const word of [...others, 'an admin in', 'Schedule', 'People', 'Games', 'areas']) {
        expect(html).not.toContain(word);
      }
    }
  });

  it('keeps staff and outsiders apart when the league’s name cannot be read', () => {
    const staff = refusalScreenOf({ email, view: viewOf(['schedule']), leagueName: null, path });
    expect(staff.kind).toBe('staff');
    expect(keys(staff)[0]).toBe('access.noAccess.notYourRole');
    expect(staff.action.label).toBe('admin.backToAdmin');
    expect(drawn(staff)).toContain('Back to north-valley');
    const other = refusalScreenOf({ email, view: viewOf([]), leagueName: null, path });
    expect(other.kind).toBe('outsider');
    expect(drawn(other)).toContain('This page is for the people who run north-valley.');
  });

  it('names no league it was not given as one that may be shown', () => {
    const screen = refusalScreenOf({ email, view: null, leagueName: null, path });
    expect(screen.kind).toBe('no-league');
    expect(ways(screen)).toEqual([
      ['access.noAccess.switch', '/signin?next=%2Fnorth-valley%2Fadmin%2Fpeople'],
    ]);
    const html = drawn(screen);
    expect(html).not.toContain('North Valley');
    expect(html).not.toContain('/north-valley"');
  });

  it('asks a visitor to sign in and come back, with the words for someone not signed in', () => {
    for (const [given, view] of [
      [null, viewOf([], null)],
      [null, null],
    ] as const) {
      const screen = refusalScreenOf({ email: given, view, leagueName: name, path });
      expect(screen.kind).toBe('visitor');
      expect(keys(screen)).toEqual(['access.noAccess.body']);
      expect(ways(screen)).toEqual([
        ['nav.signIn', '/signin?next=%2Fnorth-valley%2Fadmin%2Fpeople'],
      ]);
    }
  });

  it('has words in the message files for every sentence and way on', () => {
    const screens = [
      refusalScreenOf({ email, view: viewOf(['schedule']), leagueName: name, path }),
      refusalScreenOf({ email, view: viewOf([]), leagueName: name, path }),
      refusalScreenOf({ email, view: null, leagueName: null, path }),
      refusalScreenOf({ email: null, view: null, leagueName: null, path }),
    ];
    for (const screen of screens) {
      for (const key of [...keys(screen), ...ways(screen).map(([label]) => label)]) {
        expect(en).toHaveProperty([key as string]);
      }
    }
  });
});
