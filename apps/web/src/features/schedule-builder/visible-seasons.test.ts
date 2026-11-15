// Role test (step 2.160, review's High): a season that is not public yet is named in
// Admin → Schedule only to someone who may read its program's schedule (P4 §4). A
// scheduler limited to one program never sees the name of another program's unpublished
// season: not in the season picker, and not on the page drawn when the draft cannot be
// read (that page draws the same heading from the same filtered list).
import type { AccessHolder, Grant } from '@srleagues/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ScheduleSeason } from '../../server/schedule-admin.ts';
import { ScheduleHeading } from './schedule-heading.tsx';
import { visibleSeasons } from './visible-seasons.ts';

const programA = '01900000-0000-7000-8000-00000000a001';
const programB = '01900000-0000-7000-8000-00000000b001';
const account = '01900000-0000-7000-8000-0000000000c1';

const season = (n: number, name: string, programId: string, isPublic: boolean) =>
  ({
    id: `01900000-0000-7000-8000-00000000d00${n}`,
    name,
    slug: name.toLowerCase().replace(/ /g, '-'),
    isCurrent: n === 1,
    isPublic,
    programId,
  }) satisfies ScheduleSeason;

const seasons = [
  season(1, 'Fall Public', programB, true),
  season(2, 'Draft of A', programA, false),
  season(3, 'Secret Winter of B', programB, false),
];

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

const names = (h: AccessHolder | undefined) => visibleSeasons(h, seasons).map((s) => s.name);

describe("who sees a season that is not public yet (P4 §4, the review's High)", () => {
  it('shows a one-program scheduler only its own program’s unpublished season', () => {
    const oneProgram = holder([grant('scheduler', { type: 'program', id: programA })]);
    expect(names(oneProgram)).toEqual(['Fall Public', 'Draft of A']);
  });

  it('shows the owner and a league-wide scheduler every season', () => {
    expect(names(holder([], true))).toHaveLength(3);
    expect(names(holder([grant('scheduler', { type: 'league' })]))).toHaveLength(3);
  });

  it('shows someone with no role, or nobody, only the public ones', () => {
    expect(names(holder([]))).toEqual(['Fall Public']);
    expect(names(undefined)).toEqual(['Fall Public']);
  });

  it("draws no other program's unpublished name, in the heading the refused page uses too", () => {
    const oneProgram = holder([grant('scheduler', { type: 'program', id: programA })]);
    const shown = visibleSeasons(oneProgram, seasons);
    const first = shown[0];
    if (first === undefined) throw new Error('no season');
    const html = renderToStaticMarkup(
      createElement(ScheduleHeading, {
        seasons: shown,
        season: first,
        action: '/made-up/admin/schedule',
      }),
    );
    expect(html).toContain('Draft of A (not public yet)');
    expect(html).not.toContain('Secret Winter');
  });
});
