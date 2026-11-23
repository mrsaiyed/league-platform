// returnLeagueFor (step 2.127): the sign-in screen names the league of the page to come
// back to only when this person may see that league (U-9). Crafted return paths name a
// draft, a suspended or a binned league, a former short name and a league that does not
// exist, with capitals, encoding, `..`, `//` and backslashes; none gives a hidden league's
// name to a visitor, a coach or a stranger. Run on the made-up stand-in.
import { describe, expect, it } from 'vitest';
import type { RequestFacts } from '../context.ts';
import { standInLeagueSites } from '../stand-in-league-sites.ts';
import { standInPeople, standInPorts } from '../stand-in-ports.ts';
import { safeReturnPath } from './device.ts';
import { returnLeagueFor } from './return-league.ts';

const origin = 'http://localhost:3000';
const ports = standInPorts({
  appEnv: 'test',
  publicBaseUrl: origin,
  log: () => {},
  emailFrom: 'hello@example.test',
});
const deps = { ...ports, siteOrigin: origin };

type Who = 'visitor' | keyof typeof standInPeople;

async function factsOf(who: Who): Promise<RequestFacts> {
  return {
    host: 'localhost:3000',
    path: '/signin',
    session: who === 'visitor' ? null : await ports.identify(standInPeople[who].token),
  };
}

/** The name the sign-in screen shows for `raw` as `?next=`, after the screen's own check. */
async function named(who: Who, raw: string): Promise<string | null> {
  const found = await returnLeagueFor(
    safeReturnPath(raw),
    await factsOf(who),
    deps,
    standInLeagueSites,
  );
  return found?.name ?? null;
}

const hiddenNames = [
  'Quiet Pines League',
  'Closed Gate League',
  'Binned League',
  // The second draft; Still Waters, the empty league, starts live (step 2.194).
  'Reed Marsh League',
];
const crafted = [
  '/quiet-pines',
  '/quiet-pines/admin',
  '/QUIET-PINES',
  '/quiet-pine',
  '/%71uiet-pines',
  '/north-valley/../quiet-pines',
  '/north-valley/%2e%2e/quiet-pines',
  '/closed-gate',
  '/closed-gate/admin/settings',
  '/binned-league',
  '/reed-marsh/admin',
  '//quiet-pines',
  '/\\quiet-pines',
  '/no-such-league',
  'https://elsewhere.example/quiet-pines',
];

describe('returnLeagueFor (U-9)', () => {
  for (const who of ['visitor', 'coach', 'stranger'] as const) {
    it(`never names a hidden league to ${who === 'visitor' ? 'a visitor' : `the ${who}`}`, async () => {
      for (const raw of crafted) {
        const name = await named(who, raw);
        expect({ raw, hidden: name !== null && hiddenNames.includes(name) }).toEqual({
          raw,
          hidden: false,
        });
      }
    });
  }

  it('names a league the person may see, and leads back to its home', async () => {
    const found = await returnLeagueFor(
      safeReturnPath('/north-valley/schedule?team=owls'),
      await factsOf('visitor'),
      deps,
      standInLeagueSites,
    );
    expect(found).toEqual({ name: 'North Valley League', href: '/north-valley' });
    expect(await named('visitor', '/old-meadow')).toBe('Old Meadow League');
  });

  it('never leads back to the page that refused the person (review of step 2.157)', async () => {
    for (const who of ['visitor', 'coach', 'stranger'] as const) {
      for (const raw of ['/north-valley/admin', '/north-valley/admin/teams']) {
        const found = await returnLeagueFor(
          safeReturnPath(raw),
          await factsOf(who),
          deps,
          standInLeagueSites,
        );
        expect({ who, raw, found }).toEqual({
          who,
          raw,
          found: { name: 'North Valley League', href: '/north-valley' },
        });
      }
    }
  });

  it('leads Terms and Privacy back to the page itself, for a league the person may see', async () => {
    const found = await returnLeagueFor(
      safeReturnPath('/north-valley/schedule'),
      await factsOf('visitor'),
      deps,
      standInLeagueSites,
      'page',
    );
    expect(found).toEqual({ name: 'North Valley League', href: '/north-valley/schedule' });
    expect(
      await returnLeagueFor(
        safeReturnPath('/quiet-pines/schedule'),
        await factsOf('visitor'),
        deps,
        standInLeagueSites,
        'page',
      ),
    ).toBeNull();
  });

  it("names a draft to its own staff only, and never another draft's", async () => {
    expect(await named('scheduler', '/quiet-pines')).toBe('Quiet Pines League');
    expect(await named('otherAdmin', '/quiet-pines')).toBeNull();
    expect(await named('otherAdmin', '/reed-marsh')).toBeNull();
    expect(await named('owner', '/reed-marsh')).toBe('Reed Marsh League');
    expect(await named('otherAdmin', '/still-waters')).toBe('Still Waters League');
    expect(await named('owner', '/closed-gate')).toBe('Closed Gate League');
    expect(await named('scorekeeper', '/closed-gate')).toBeNull();
  });

  it('names nothing with no page to come back to, or a league in the bin to anyone', async () => {
    expect(
      await returnLeagueFor(null, await factsOf('owner'), deps, standInLeagueSites),
    ).toBeNull();
    expect(await named('owner', '/binned-league')).toBeNull();
  });
});
