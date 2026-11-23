// The viewer a signed-in person's roles make (step 2.46, T-287): who is one of the league's
// admins and whose team's staff, for the signed-in request after a public page (T-95).
import { describe, expect, it } from 'vitest';
import type { AccessHolder, Grant, Role, Scope } from '../../access/index.ts';
import { statsShown } from './stats-shown.ts';
import { publicViewer, signedInViewer } from './viewer.ts';

const league = '01900000-0000-7000-8000-000000000001';
const me = '01900000-0000-7000-8000-0000000000a1';
const someoneElse = '01900000-0000-7000-8000-0000000000a2';
const teamA = '01900000-0000-7000-8000-0000000000c1';
const teamB = '01900000-0000-7000-8000-0000000000c2';
const program = '01900000-0000-7000-8000-0000000000d1';

let n = 0;
const grant = (
  role: Role,
  scope: Scope = { type: 'league' },
  more: Partial<Grant> = {},
): Grant => ({
  id: `01900000-0000-7000-8000-${(0xe00 + n++).toString(16).padStart(12, '0')}`,
  accountId: me,
  role,
  scope,
  grantedByAccountId: someoneElse,
  revokedAt: null,
  ...more,
});
const holding = (grants: readonly Grant[], isOwner = false): AccessHolder => ({
  accountId: me,
  isOwner,
  grants,
});
const staffOnly = (teamId: string) => ({
  leagueId: league,
  teamId,
  statsVisibility: 'staff' as const,
});

describe('signedInViewer (S-22, T-87, T-287)', () => {
  it('is the public viewer for a visitor', () => {
    expect(signedInViewer(league, undefined)).toEqual(publicViewer(league));
  });

  it("makes the league's owner and an admin of the whole league its admins", () => {
    expect(signedInViewer(league, holding([], true)).leagueAdmin).toBe(true);
    expect(signedInViewer(league, holding([grant('admin')])).leagueAdmin).toBe(true);
    const admin = signedInViewer(league, holding([grant('admin')]));
    expect(statsShown(staffOnly(teamA), admin)).toBe('player_lines');
  });

  it('makes no one an admin by an admin role limited to one program (fail closed)', () => {
    const viewer = signedInViewer(
      league,
      holding([grant('admin', { type: 'program', id: program })]),
    );
    expect(viewer).toEqual(publicViewer(league));
  });

  it("makes a coach or captain of a team that team's staff, and no other team's", () => {
    for (const role of ['coach', 'captain'] as const) {
      const viewer = signedInViewer(league, holding([grant(role, { type: 'team', id: teamA })]));
      expect(viewer.leagueAdmin, role).toBe(false);
      expect(viewer.staffOfTeamIds, role).toEqual([teamA]);
      expect(statsShown(staffOnly(teamA), viewer), role).toBe('player_lines');
      expect(statsShown(staffOnly(teamB), viewer), role).toBe('team_totals');
    }
  });

  it('reads a team id in capitals as the same team', () => {
    const viewer = signedInViewer(
      league,
      holding([grant('coach', { type: 'team', id: teamA.toUpperCase() })]),
    );
    expect(viewer.staffOfTeamIds).toEqual([teamA]);
  });

  it('gives a coach role on the whole league or a program no team', () => {
    const viewer = signedInViewer(
      league,
      holding([grant('coach'), grant('captain', { type: 'program', id: program })]),
    );
    expect(viewer).toEqual(publicViewer(league));
  });

  it('gives every other role what the public sees', () => {
    for (const role of ['registrar', 'scheduler', 'editor', 'scorekeeper'] as const) {
      expect(signedInViewer(league, holding([grant(role)])), role).toEqual(publicViewer(league));
    }
    const clubAdmin = signedInViewer(
      league,
      holding([grant('club_admin', { type: 'club', id: teamA })]),
    );
    expect(clubAdmin).toEqual(publicViewer(league));
    const teamAdmin = signedInViewer(
      league,
      holding([grant('club_admin', { type: 'team', id: teamA })]),
    );
    expect(teamAdmin).toEqual(publicViewer(league));
  });

  it("counts no grant that was taken back, nor another account's", () => {
    const viewer = signedInViewer(
      league,
      holding([
        grant('admin', { type: 'league' }, { revokedAt: '2026-11-01T00:00:00Z' }),
        grant('coach', { type: 'team', id: teamA }, { revokedAt: '2026-11-01T00:00:00Z' }),
        grant('admin', { type: 'league' }, { accountId: someoneElse }),
        grant('coach', { type: 'team', id: teamB }, { accountId: someoneElse }),
      ]),
    );
    expect(viewer).toEqual(publicViewer(league));
  });

  it("is a viewer of this league only: another league's team shows its totals", () => {
    const viewer = signedInViewer(league, holding([], true));
    const otherLeague = '01900000-0000-7000-8000-000000000002';
    expect(
      statsShown({ leagueId: otherLeague, teamId: teamA, statsVisibility: 'staff' }, viewer),
    ).toBe('team_totals');
  });

  it('lists each team once, in one order', () => {
    const viewer = signedInViewer(
      league,
      holding([
        grant('captain', { type: 'team', id: teamB }),
        grant('coach', { type: 'team', id: teamA }),
        grant('captain', { type: 'team', id: teamA }),
      ]),
    );
    expect(viewer.staffOfTeamIds).toEqual([teamA, teamB]);
  });
});
