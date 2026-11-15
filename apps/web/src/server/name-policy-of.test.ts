// Step 2.126: what the admin saves on League settings → Privacy is what the public pages
// show. On the made-up stand-ins: the settings store the admin screen saves to, the
// statistics settings the team and statistics pages read, a youth team's roster and the
// T-81 scan of it under each setting. The same through the whole web wiring, for every
// surface, is names-through-ports.test.ts; across every surface and every person's
// request, core's modules/name-policy-scan.test.ts.
import {
  adultStartNamePolicy,
  defaultNamePolicy,
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
import {
  adultTeams,
  standInAudienceOf,
  standInPublicStats,
  youthTeams,
} from './stand-in-public-stats.ts';
import { standInPublicTeams } from './stand-in-public-teams.ts';

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
  const ids = { adultLeagueId: adult, youthLeagueId: youth };
  const settings = standInAdminSettings({
    accessOf: () => access,
    log: () => undefined,
    audienceOf: standInAudienceOf(ids),
  });
  const stats = standInPublicStats(ids, namePolicyOf(settings.deps));
  const teams = standInPublicTeams(ids, ownerId);
  const rockets = youthTeams.find((t) => t.slug === 'rockets')?.id ?? '';
  const rosterNames = async () => {
    const policy = (await stats.settingsOf(youth)).namePolicy;
    const roster = await teams.rosterOf(youth, rockets, { viewer: publicViewer(youth), policy });
    return roster.lines;
  };
  const set = (
    key: string,
    value: unknown,
    extra: Record<string, unknown> = {},
    who = ownerId,
    leagueId = youth,
  ) =>
    setSetting(
      as(who, leagueId),
      { level: 'league', key, value, version: null, ...extra },
      settings.deps,
    );
  return { stats, rosterNames, set, teams };
}

const texts = (lines: readonly { readonly name: { shown: boolean } }[]) =>
  lines.map((l) => ('text' in l.name ? l.name.text : null));

describe("the league's privacy settings on its public pages (T-81)", () => {
  it('shows children by first name and last initial until the admin confirms full names', async () => {
    const { stats, rosterNames, set } = made();
    expect(texts(await rosterNames())).toEqual(['Noor H.', 'Jay W.', 'Tess M.']);
    expect(await set('privacy.publicNames', 'fullName')).toEqual({
      ok: false,
      error: { code: 'confirmation-needed' },
    });
    expect(await set('privacy.publicNames', 'fullName', { confirmed: true })).toMatchObject({
      ok: true,
    });
    expect(texts(await rosterNames())).toEqual(['Noor Haddad', 'Jay Whitaker', 'Tess Moreno']);
    // Each league has its own settings: the adult league is untouched, on its start.
    expect((await stats.settingsOf(adult)).namePolicy).toEqual(adultStartNamePolicy);
  });

  it("follows an adult league's choice of less for its adults, and full names with no confirmation (R-29)", async () => {
    const { stats, set, teams } = made();
    const falcons = adultTeams.find((t) => t.slug === 'falcons')?.id ?? '';
    const adultRoster = async () => {
      const policy = (await stats.settingsOf(adult)).namePolicy;
      const roster = await teams.rosterOf(adult, falcons, { viewer: publicViewer(adult), policy });
      return texts(roster.lines);
    };
    const names = (value: string, version: number | null) =>
      set('privacy.publicNames', value, { version }, ownerId, adult);
    // Rosa Delgado is the coach, with no number.
    expect(await adultRoster()).toEqual([
      'Dana Whitfield',
      'Marcus Oyelaran',
      null,
      'Rosa Delgado',
      'Pat Gorski',
    ]);
    expect(await names('hidden', null)).toMatchObject({ ok: true });
    expect(await adultRoster()).toEqual([null, null, null, null, null]);
    expect(await names('firstNameLastInitial', 1)).toMatchObject({ ok: true });
    expect(await adultRoster()).toEqual(['Dana W.', 'Marcus O.', null, 'Rosa D.', 'Pat G.']);
    // Full names again: no confirmation asked, and the league is back on its start.
    expect(await names('fullName', 2)).toEqual({
      ok: true,
      value: { key: 'privacy.publicNames', version: null },
    });
    expect((await adultRoster())[0]).toBe('Dana Whitfield');
    expect((await stats.settingsOf(adult)).namePolicy).toEqual(adultStartNamePolicy);
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
    expect(texts(await rosterNames())).toEqual(['Noor H.', 'Jay W.', 'Tess M.']);
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
    const settings = standInAdminSettings({ accessOf: () => access, log: () => undefined });
    const names = namesShownOf(namePolicyOf(settings.deps), (leagueId) =>
      leagueId === adult ? 'adult' : undefined,
    );
    expect((await names(adult)).audience).toBe('adult');
    expect((await names(youth)).audience).toBe('youth');
    expect((await names(youth)).policy).toEqual(defaultNamePolicy);
    // An adult league starts on full names, not confirmed for children (record 065).
    expect((await names(adult)).policy).toEqual(adultStartNamePolicy);
  });
});
