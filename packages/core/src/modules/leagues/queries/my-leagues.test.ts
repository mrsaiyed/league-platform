// myLeagues (record 066): only leagues the account belongs to, and of those only what
// U-9 lets that person see, decided by the league pages' own rule.
import { describe, expect, it } from 'vitest';
import { roles, type Role, type Scope } from '../../access/index.ts';
import { leagueStatuses, type LeagueStatus } from '../league-values.ts';
import { myLeagues, type AccountLeagueRow } from './my-leagues.ts';

const me = '01900000-0000-7000-8000-0000000000a1';
const leagueId = (n: number) => `01900000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const program: Scope = { type: 'program', id: '01900000-0000-7000-8000-0000000000c1' };

type Held = {
  readonly isOwner?: boolean;
  readonly grants?: readonly { readonly role: Role; readonly scope: Scope }[];
  readonly onRoster?: boolean;
};
/** A row as the reader gives it, for grants written with their scope. */
const row = (status: LeagueStatus, held: Held, n = 1): AccountLeagueRow => ({
  leagueId: leagueId(n),
  slug: `league-${n}`,
  name: `League ${n}`,
  status,
  isOwner: held.isOwner ?? false,
  roles: [...new Set((held.grants ?? []).map((g) => g.role))],
  leagueWideRoles: [
    ...new Set((held.grants ?? []).filter((g) => g.scope.type === 'league').map((g) => g.role)),
  ],
  onRoster: held.onRoster ?? false,
});
const reading =
  (...rows: AccountLeagueRow[]) =>
  async () =>
    rows;
const seen = async (one: AccountLeagueRow) => (await myLeagues(me, reading(one))).length === 1;

/** The roles with an area of the admin (P4 §4), and those whose tools are on the team page. */
const staffRoles: readonly Role[] = [
  'admin',
  'registrar',
  'scheduler',
  'editor',
  'scorekeeper',
  'club_admin',
];
const teamRoles: readonly Role[] = ['coach', 'captain'];

describe('myLeagues (record 066)', () => {
  it('gives a visitor nothing, and never asks the reader', async () => {
    let asked = false;
    const result = await myLeagues(null, async () => {
      asked = true;
      return [row('live', { isOwner: true })];
    });
    expect(result).toEqual([]);
    expect(asked).toBe(false);
  });

  it('lists a league by each of the three ways in: owner, a role, a roster place', async () => {
    const found = await myLeagues(
      me,
      reading(
        row('live', { isOwner: true }, 1),
        row('live', { grants: [{ role: 'scorekeeper', scope: { type: 'league' } }] }, 2),
        row('live', { onRoster: true }, 3),
        // A row with none of the three is not a league this person belongs to.
        row('live', {}, 4),
      ),
    );
    expect(found.map((l) => [l.slug, l.memberships])).toEqual([
      ['league-1', ['owner']],
      ['league-2', ['scorekeeper']],
      ['league-3', ['on-a-team']],
    ]);
  });

  it('names each role once, owner first and a roster place last', async () => {
    const [only] = await myLeagues(
      me,
      reading(
        row('live', {
          isOwner: true,
          onRoster: true,
          grants: [
            { role: 'coach', scope: { type: 'league' } },
            { role: 'scheduler', scope: program },
            { role: 'scheduler', scope: { type: 'league' } },
          ],
        }),
      ),
    );
    expect(only?.memberships).toEqual(['owner', 'scheduler', 'coach', 'on-a-team']);
  });

  it('shows live and archived leagues to everyone who belongs', async () => {
    for (const status of ['live', 'archived'] as const) {
      expect(await seen(row(status, { onRoster: true })), status).toBe(true);
      for (const role of roles) {
        expect(await seen(row(status, { grants: [{ role, scope: program }] })), role).toBe(true);
      }
    }
  });

  // The role test: a draft league is shown to everyone with an admin area in it and to
  // nobody else (U-9), at any scope.
  it('shows a draft league to its staff only, never to a coach, a captain or a player', async () => {
    expect(await seen(row('draft', { isOwner: true }))).toBe(true);
    for (const role of staffRoles) {
      for (const scope of [{ type: 'league' } as const, program]) {
        expect(await seen(row('draft', { grants: [{ role, scope }] })), role).toBe(true);
      }
    }
    for (const role of teamRoles) {
      expect(await seen(row('draft', { grants: [{ role, scope: { type: 'league' } }] }))).toBe(
        false,
      );
    }
    expect(await seen(row('draft', { onRoster: true }))).toBe(false);
    expect(
      await seen(
        row('draft', {
          onRoster: true,
          grants: [{ role: 'coach', scope: { type: 'league' } }],
        }),
      ),
    ).toBe(false);
  });

  it('shows a suspended league to its owner and its admins for the whole league only', async () => {
    expect(await seen(row('suspended', { isOwner: true }))).toBe(true);
    expect(
      await seen(row('suspended', { grants: [{ role: 'admin', scope: { type: 'league' } }] })),
    ).toBe(true);
    expect(await seen(row('suspended', { grants: [{ role: 'admin', scope: program }] }))).toBe(
      false,
    );
    for (const role of roles.filter((r) => r !== 'admin')) {
      expect(
        await seen(row('suspended', { grants: [{ role, scope: { type: 'league' } }] })),
        role,
      ).toBe(false);
    }
    expect(await seen(row('suspended', { onRoster: true }))).toBe(false);
  });

  it("never lets a hidden league's name out: the result holds nothing of it", async () => {
    const hidden = { ...row('draft', { onRoster: true }, 9), name: 'Secret Draft League' };
    const found = await myLeagues(me, reading(row('live', { onRoster: true }, 1), hidden));
    expect(JSON.stringify(found)).not.toContain('Secret Draft League');
    expect(JSON.stringify(found)).not.toContain(hidden.leagueId);
    expect(JSON.stringify(found)).not.toContain(hidden.slug);
  });

  it('decides every state the leagues module knows', async () => {
    for (const status of leagueStatuses) {
      expect(await seen(row(status, { isOwner: true })), status).toBe(true);
    }
  });

  it('lists by name, the same order every time', async () => {
    const found = await myLeagues(
      me,
      reading(
        { ...row('live', { onRoster: true }, 1), name: 'Zebra League' },
        { ...row('live', { onRoster: true }, 2), name: 'Apple League' },
      ),
    );
    expect(found.map((l) => l.name)).toEqual(['Apple League', 'Zebra League']);
  });
});
