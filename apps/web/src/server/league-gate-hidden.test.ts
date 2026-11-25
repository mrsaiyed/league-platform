// Step 2.223: a league hidden from this person (a draft or suspended league, or one in
// the bin) is "not found" by every way in, the same answer as a short name or an id no
// league has, after the same reads in the same order (T-449). Pages through
// resolveLeagueRequest, endpoints through resolveLeagueApi, which applies mayOpenLeague
// itself before any endpoint reads its body. Hand-made ports that write down each read.
import {
  leagueApiUrl,
  leagueUrl,
  ok,
  type AccessHolder,
  type CommandContext,
  type Grant,
  type LeagueStatus,
} from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import type { RequestFacts } from './context.ts';
import { resolveLeagueApi, type LeagueApiDeps } from './league-api.ts';
import {
  leaguePageOutcome,
  noLeagueId,
  resolveLeagueRequest,
  type LeagueWant,
} from './league-gate.ts';

const leagueId = (n: number) => `01900000-0000-7000-8000-0000000000${n.toString(16)}`;

type League = {
  readonly id: string;
  readonly slug: string;
  readonly status: LeagueStatus;
  readonly inBin: boolean;
};

// Every short name is twelve letters long, the missing one too.
const leagues = {
  draft: { id: leagueId(0xd1), slug: 'draft-league', status: 'draft', inBin: false },
  suspended: { id: leagueId(0xd2), slug: 'closed-leagu', status: 'suspended', inBin: false },
  binned: { id: leagueId(0xd3), slug: 'binned-leagu', status: 'live', inBin: true },
  live: { id: leagueId(0xd4), slug: 'open-leagues', status: 'live', inBin: false },
  other: { id: leagueId(0xd5), slug: 'other-league', status: 'live', inBin: false },
} as const satisfies Record<string, League>;
const missing = { id: leagueId(0xdf), slug: 'missing-leag' };
const hidden = ['draft', 'suspended', 'binned'] as const;

const accountId = (n: number) => `01900000-0000-7000-8000-0000000000${n.toString(16)}`;
const grant = (account: string, role: Grant['role'], scope: Grant['scope']): Grant => ({
  id: `grant-${role}`,
  accountId: account,
  role,
  scope,
  grantedByAccountId: null,
  revokedAt: null,
});
const team = { type: 'team', id: '01900000-0000-7000-8000-0000000000e1' } as const;

/** Each person, and what they hold in each league (none where not named). */
const people = {
  stranger: { account: accountId(0xa1), holds: () => [] },
  otherLeagueAdmin: {
    account: accountId(0xa2),
    holds: (league: string) =>
      league === leagues.other.id ? [grant(accountId(0xa2), 'admin', { type: 'league' })] : [],
  },
  coach: { account: accountId(0xa3), holds: () => [grant(accountId(0xa3), 'coach', team)] },
  // A team's member with a role of their own in it, and no area of the admin.
  member: { account: accountId(0xa4), holds: () => [grant(accountId(0xa4), 'captain', team)] },
  scheduler: {
    account: accountId(0xa5),
    holds: () => [grant(accountId(0xa5), 'scheduler', { type: 'league' })],
  },
  owner: { account: accountId(0xa6), holds: () => [] },
} as const;
type Person = keyof typeof people | 'visitor';
const outsiders = ['visitor', 'stranger', 'otherLeagueAdmin', 'coach', 'member'] as const;

function world() {
  const reads: string[] = [];
  const all: readonly League[] = Object.values(leagues);
  const deps: LeagueApiDeps = {
    siteOrigin: 'http://localhost:3000',
    newRequestId: () => 'request-1',
    findLeague: async (shortName) => {
      reads.push('findLeague');
      const found = all.find((l) => l.slug === shortName);
      return found === undefined
        ? undefined
        : {
            leagueId: found.id,
            slug: found.slug,
            status: found.status,
            inBin: found.inBin,
            forwarded: false,
          };
    },
    findLeagueById: async (id) => {
      reads.push('findLeagueById');
      const found = all.find((l) => l.id === id && !l.inBin);
      return found === undefined
        ? undefined
        : { id: found.id, slug: found.slug, status: found.status };
    },
    accessOf: async (context: CommandContext): Promise<AccessHolder | undefined> => {
      reads.push('accessOf');
      const person = Object.values(people).find((p) => p.account === context.accountId);
      if (person === undefined) return undefined;
      const known = all.some((l) => l.id === context.leagueId && !l.inBin);
      if (!known) return undefined;
      return {
        accountId: person.account,
        isOwner: person === people.owner,
        grants: person.holds(context.leagueId),
      };
    },
  };
  return { reads, deps };
}

const sessionOf = (who: Person): RequestFacts['session'] =>
  who === 'visitor'
    ? null
    : ok({
        accountId: people[who].account,
        email: 'someone@example.test',
        emailConfirmed: true,
        sessionId: 's',
        hasPassword: true,
        passwordEnteredAt: null,
        lastSignInAt: new Date(0),
      });

const wants: readonly LeagueWant[] = [
  { page: 'site' },
  { page: 'admin', area: null },
  { page: 'admin', area: 'games' },
  { page: 'score' },
];

async function page(who: Person, slug: string) {
  const { reads, deps } = world();
  const resolved = await resolveLeagueRequest(
    { host: 'localhost:3000', path: leagueUrl({ slug }, 'admin'), session: sessionOf(who) },
    deps,
  );
  return { outcomes: wants.map((want) => leaguePageOutcome(resolved, want)), reads };
}

const game = '01900000-0000-7000-8000-0000000b0001';
/** Each league endpoint's address parts (app/api/v1/leagues/[leagueId]/). */
const endpoints: readonly (readonly string[])[] = [
  ['scoring'],
  ['staff-numbers'],
  ['my-team'],
  ...[
    'commands',
    'not-started',
    'reopen',
    'rosters',
    'session',
    'state',
    'format',
    'copy',
    'snapshot',
  ].map((end) => ['games', game, end]),
];

async function api(who: Person, id: string, parts: readonly string[], mode: 'refuse' | 'visitor') {
  const { reads, deps } = world();
  const facts = {
    host: 'localhost:3000',
    path: leagueApiUrl({ id }, parts),
    session: sessionOf(who),
  };
  const resolved = await resolveLeagueApi(facts, parts, deps, mode);
  return { resolved, reads };
}

describe('a hidden league by its pages (resolveLeagueRequest)', () => {
  it('is "not found" to each outsider, the answer for a short name no league has', async () => {
    for (const which of hidden) {
      for (const who of outsiders) {
        const there = await page(who, leagues[which].slug);
        const none = await page(who, missing.slug);
        expect(there.outcomes, `${which}, ${who}`).toEqual(none.outcomes);
        expect(none.outcomes.every((o) => o.kind === 'not-found')).toBe(true);
      }
    }
  });

  it('costs the same reads, in the same order, as a short name no league has (T-449)', async () => {
    for (const which of hidden) {
      for (const who of outsiders) {
        const there = await page(who, leagues[which].slug);
        const none = await page(who, missing.slug);
        expect(there.reads, `${which}, ${who}`).toEqual(none.reads);
      }
    }
    // A signed-in person's request reads their access for a missing league too.
    expect((await page('stranger', missing.slug)).reads).toEqual(['findLeague', 'accessOf']);
    expect((await page('visitor', missing.slug)).reads).toEqual(['findLeague']);
  });

  it('still opens to those who may see it', async () => {
    const draft = await page('scheduler', leagues.draft.slug);
    expect(draft.outcomes.map((o) => o.kind)).toEqual(['show', 'show', 'show', 'show']);
    for (const who of outsiders) {
      expect((await page(who, leagues.live.slug)).outcomes[0]?.kind).toBe('show');
    }
  });
});

describe('a hidden league by its endpoints (resolveLeagueApi)', () => {
  it('is "not found" to each outsider at every endpoint, the answer for an id no league has', async () => {
    for (const which of hidden) {
      for (const who of outsiders) {
        for (const parts of endpoints) {
          for (const mode of ['refuse', 'visitor'] as const) {
            const there = await api(who, leagues[which].id, parts, mode);
            const none = await api(who, missing.id, parts, mode);
            const label = `${which}, ${who}, ${parts.join('/')}, ${mode}`;
            expect(there.resolved, label).toEqual(none.resolved);
            expect(none.resolved, label).toEqual({
              ok: false,
              refusal: { status: 404, error: 'not-found' },
            });
          }
        }
      }
    }
  });

  it('costs the same reads, in the same order, as an id no league has (T-449)', async () => {
    for (const which of hidden) {
      for (const who of outsiders) {
        const parts = endpoints[3] ?? [];
        const there = await api(who, leagues[which].id, parts, 'refuse');
        const none = await api(who, missing.id, parts, 'refuse');
        expect(there.reads, `${which}, ${who}`).toEqual(none.reads);
      }
    }
    expect((await api('stranger', missing.id, ['scoring'], 'refuse')).reads).toEqual([
      'findLeagueById',
      'accessOf',
    ]);
  });

  it('never asks about a league no league has but by the one id that names none', async () => {
    const asked: string[] = [];
    const { deps } = world();
    await resolveLeagueApi(
      {
        host: 'localhost:3000',
        path: leagueApiUrl({ id: missing.id }, ['scoring']),
        session: sessionOf('stranger'),
      },
      ['scoring'],
      { ...deps, accessOf: async (context) => void asked.push(context.leagueId) },
    );
    expect(asked).toEqual([noLeagueId]);
  });

  it('changes nothing for those who may open the league, and hands over what they hold', async () => {
    const live = await api('visitor', leagues.live.id, endpoints[3] ?? [], 'refuse');
    expect(live.resolved).toMatchObject({ ok: true, holder: undefined });
    const stranger = await api('stranger', leagues.live.id, ['scoring'], 'visitor');
    expect(stranger.resolved).toMatchObject({ ok: true, holder: { grants: [] } });
    const scheduler = await api('scheduler', leagues.draft.id, endpoints[3] ?? [], 'refuse');
    expect(scheduler.resolved.ok && scheduler.resolved.holder?.grants[0]?.role).toBe('scheduler');
    const owner = await api('owner', leagues.suspended.id, ['scoring'], 'refuse');
    expect(owner.resolved).toMatchObject({ ok: true, holder: { isOwner: true } });
    expect(owner.reads).toEqual(['findLeagueById', 'accessOf']);
  });
});
