// Step 2.126: what the admin saves on League settings → Privacy is what the public pages
// show. On the made-up stand-ins: the settings store the admin screen saves to, the
// statistics settings the team and statistics pages read, a youth team's roster and the
// T-81 scan of it under each setting. The same through the whole web wiring, for every
// surface, is names-through-ports.test.ts; across every surface and every person's
// request, core's modules/name-policy-scan.test.ts.
import {
  findPrivateFields,
  privateValuesOf,
  publicViewer,
  setSetting,
  type AccessReader,
  type CommandContext,
} from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { namePolicyOf, namesShownOf } from './name-policy-of.ts';
import { standInAdminSettings } from './stand-in-admin-settings.ts';
import { standInPublicStats, youthTeams } from './stand-in-public-stats.ts';
import { standInPublicTeams } from './stand-in-public-teams.ts';
import { testWorld } from './stand-in-world.test-helper.ts';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
const ownerId = '01900000-0000-7000-8000-0000000000a1';
const scorekeeperId = '01900000-0000-7000-8000-0000000000a5';
const access: AccessReader = {
  ownerAccountId: async () => ownerId,
  leagueStatus: async () => 'live',
  activeGrantsOf: async (accountId) =>
    accountId === scorekeeperId
      ? [
          {
            id: '01900000-0000-7000-8000-0000000000d5',
            accountId,
            role: 'scorekeeper',
            scope: { type: 'league' },
            grantedByAccountId: ownerId,
            revokedAt: null,
          },
        ]
      : [],
};
const as = (accountId: string, leagueId = youth): CommandContext => ({
  leagueId,
  accountId,
  requestId: 'request-1',
});

function made() {
  const world = testWorld(() => access);
  const settings = standInAdminSettings(world);
  const stats = standInPublicStats(world, namePolicyOf(settings.deps));
  const teams = standInPublicTeams(world);
  const rockets = youthTeams.find((t) => t.slug === 'rockets')?.id ?? '';
  const rosterNames = async () => {
    const policy = (await stats.settingsOf(youth)).namePolicy;
    const roster = await teams.rosterOf(youth, rockets, { viewer: publicViewer(youth), policy });
    return roster.lines;
  };
  const set = (key: string, value: unknown, extra: Record<string, unknown> = {}, who = ownerId) =>
    setSetting(as(who), { level: 'league', key, value, version: null, ...extra }, settings.deps);
  return { stats, rosterNames, set };
}

const texts = (lines: readonly { readonly name: { shown: boolean } }[]) =>
  lines.map((l) => ('text' in l.name ? l.name.text : null));

describe("the league's privacy settings on its public pages (T-81)", () => {
  it('shows children by first name and last initial until the admin confirms full names', async () => {
    const { stats, rosterNames, set } = made();
    // The team's coach is a grown-up, shown in full under every setting for children.
    expect(texts(await rosterNames())).toEqual(['Noor H.', 'Jay W.', 'Lena Ortiz', 'Tess M.']);
    expect(await set('privacy.publicNames', 'fullName')).toEqual({
      ok: false,
      error: { code: 'confirmation-needed' },
    });
    expect(await set('privacy.publicNames', 'fullName', { confirmed: true })).toMatchObject({
      ok: true,
    });
    expect(texts(await rosterNames())).toEqual([
      'Noor Haddad',
      'Jay Whitaker',
      'Lena Ortiz',
      'Tess Moreno',
    ]);
    // Each league has its own settings: the adult league is untouched.
    expect((await stats.settingsOf(adult)).namePolicy.children).toBe('first_name_last_initial');
  });

  it('lets no scorekeeper change either setting', async () => {
    const { rosterNames, set } = made();
    const refused = await set(
      'privacy.publicNames',
      'fullName',
      { confirmed: true },
      scorekeeperId,
    );
    expect(refused).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    expect(await set('privacy.playersMayAskForInitials', true, {}, scorekeeperId)).toMatchObject({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(texts(await rosterNames())).toEqual(['Noor H.', 'Jay W.', 'Lena Ortiz', 'Tess M.']);
  });

  it('finds no private field or value on the roster under each setting', async () => {
    const people = [
      { firstName: 'Noor', lastName: 'Haddad', nameRequest: 'none' as const },
      { firstName: 'Jay', lastName: 'Whitaker', nameRequest: 'none' as const },
      { firstName: 'Tess', lastName: 'Moreno', nameRequest: 'none' as const },
    ];
    const expected = {
      fullName: 'Noor Haddad',
      firstNameLastInitial: 'Noor H.',
      hidden: null,
    } as const;
    for (const names of ['fullName', 'firstNameLastInitial', 'hidden'] as const) {
      for (const initials of [false, true]) {
        const { rosterNames, set } = made();
        await set('privacy.publicNames', names, { confirmed: true });
        await set('privacy.playersMayAskForInitials', initials);
        const lines = await rosterNames();
        // Built from what the settings say is shown, not from the lines themselves.
        const privateValues = people.flatMap((p) =>
          privateValuesOf(
            p,
            names === 'hidden'
              ? { shown: false, why: 'hidden' }
              : names === 'fullName'
                ? { shown: true, text: `${p.firstName} ${p.lastName}` }
                : { shown: true, text: `${p.firstName} ${p.lastName[0]}.` },
          ),
        );
        expect(findPrivateFields(lines, { privateValues }), `${names}, ${initials}`).toEqual([]);
        expect(texts(lines)[0], `${names}, ${initials}`).toBe(expected[names]);
      }
    }
  });
});

describe('namesShownOf', () => {
  it("gives the league's audience and policy, and reads a league it does not know as youth", async () => {
    const settings = standInAdminSettings(testWorld(() => access));
    const names = namesShownOf(namePolicyOf(settings.deps), (leagueId) =>
      leagueId === adult ? 'adult' : undefined,
    );
    expect((await names(adult)).audience).toBe('adult');
    expect((await names(youth)).audience).toBe('youth');
    expect((await names(youth)).policy).toEqual({
      children: 'first_name_last_initial',
      playersMayAskForInitials: false,
    });
  });
});
