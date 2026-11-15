// Role test (step 2.160, the reviews' High and "where the rule lives"): a season that is not
// public yet is named in Admin → Schedule only to someone who may read its program's
// schedule (P4 §4), and the list of seasons itself applies that rule: the port
// `scheduleAdmin.seasonsOf` takes the holder and lists only what the holder may be told of.
// A scheduler limited to one program never sees the name of another program's unpublished
// season: not in the season picker, and not on the page drawn when the draft cannot be read
// (that page draws the same heading from the same list).
import type { AccessHolder, Grant } from '@srleagues/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { standInLeagues } from '../../server/stand-in-cast.ts';
import { standInSchedule } from '../../server/stand-in-schedule.ts';
import { standInSeasonIds } from '../../server/stand-in-world-seed.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { ScheduleHeading } from './schedule-heading.tsx';

const leagueId = standInLeagues.live.id;
const programB = '01900000-0000-7000-8000-00000000b001';
const account = '01900000-0000-7000-8000-0000000000c1';

// The adult league, its seasons put in two programs: its public seasons in program B, its
// season not public yet ("Winter 2027") left in program A, and a second one not public yet,
// "Secret Winter", in program B.
let programA = '';
const ports = standInSchedule(
  testWorld(undefined, undefined, (leagues) => {
    const adult = leagues.find((l) => l.seasons.some((s) => s.id === standInSeasonIds.adultNext));
    const next = adult?.seasons.find((s) => s.id === standInSeasonIds.adultNext);
    if (adult === undefined || next === undefined) throw new Error('no adult league');
    programA = next.programId;
    adult.seasons = [
      ...adult.seasons.map((s) => (s.id === next.id ? s : { ...s, programId: programB })),
      {
        ...next,
        id: '01900000-0000-7000-8000-00000000d003',
        name: 'Secret Winter',
        slug: 'secret-winter',
        programId: programB,
      },
    ];
  }),
);

const grant = (role: Grant['role'], scope: Grant['scope']): Grant => ({
  id: '01900000-0000-7000-8000-0000000000f1',
  accountId: account,
  role,
  scope,
  grantedByAccountId: null,
  revokedAt: null,
});
const holder = (grants: readonly Grant[], isOwner = false): AccessHolder => ({
  accountId: account,
  isOwner,
  grants,
});
const oneProgram = () => holder([grant('scheduler', { type: 'program', id: programA })]);

const names = async (h: AccessHolder | undefined) =>
  (await ports.seasonsOf(leagueId, h)).map((s) => s.name);
const publicNames = async () =>
  (await ports.seasonsOf(leagueId, holder([], true))).filter((s) => s.isPublic).map((s) => s.name);

describe("who is told of a season that is not public yet (P4 §4, the review's High)", () => {
  it('lists a one-program scheduler only its own program’s unpublished season', async () => {
    const listed = await names(oneProgram());
    expect(listed).toEqual([...(await publicNames()), 'Winter 2027']);
    expect(listed).not.toContain('Secret Winter');
  });

  it('lists the owner and a league-wide scheduler every season', async () => {
    const every = await names(holder([], true));
    expect(every).toContain('Winter 2027');
    expect(every).toContain('Secret Winter');
    expect(await names(holder([grant('scheduler', { type: 'league' })]))).toEqual(every);
  });

  it('lists someone with no role, or nobody, only the public ones', async () => {
    const shown = await publicNames();
    expect(shown.length).toBeGreaterThan(0);
    expect(await names(holder([]))).toEqual(shown);
    expect(await names(undefined)).toEqual(shown);
  });

  it('cannot be asked without saying who asks, and then tells of nothing not public', async () => {
    // @ts-expect-error The holder is required: a list of seasons for staff says who asks.
    const unsaid: readonly { readonly isPublic: boolean }[] = await ports.seasonsOf(leagueId);
    expect(unsaid.length).toBeGreaterThan(0);
    expect(unsaid.every((s) => s.isPublic)).toBe(true);
  });

  it("draws no other program's unpublished name, in the heading the refused page uses too", async () => {
    const shown = await ports.seasonsOf(leagueId, oneProgram());
    const first = shown[0];
    if (first === undefined) throw new Error('no season');
    const html = renderToStaticMarkup(
      createElement(ScheduleHeading, {
        seasons: shown,
        season: first,
        action: '/made-up/admin/schedule',
      }),
    );
    expect(html).toContain('Winter 2027 (not public yet)');
    expect(html).not.toContain('Secret Winter');
  });
});
