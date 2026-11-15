// The stand-in's leagues of an account (step 2.127): the same rows the database's
// my_leagues() gives, for the asked account only, never a league in the bin; core's
// myLeagues then shows each person what the league's own pages would.
import { myLeagues } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInLeagues, standInPeople, standInPorts } from './stand-in-ports.ts';
import { standInMemberAccountId } from './stand-in-sign-ins.ts';

const ports = standInPorts({
  appEnv: 'test',
  publicBaseUrl: 'http://localhost:3000',
  log: () => {},
  emailFrom: 'hello@example.test',
});
const slugsOf = async (accountId: string) =>
  (await ports.leaguesOfAccount(accountId)).map((row) => row.slug).sort();
const shownTo = async (accountId: string) =>
  (await myLeagues(accountId, () => ports.leaguesOfAccount(accountId))).map((l) => l.slug).sort();

describe('the stand-in leagues of an account', () => {
  it('gives the owner every league they own, and never the one in the bin', async () => {
    const slugs = await slugsOf(standInPeople.owner.accountId);
    expect(slugs).not.toContain(standInLeagues.inBin.slug);
    expect(slugs).toEqual(
      Object.values(standInLeagues)
        .filter((l) => l !== standInLeagues.inBin)
        .map((l) => l.slug)
        .sort(),
    );
  });

  it('gives each person only their own leagues (account A never sees account B’s)', async () => {
    expect(await slugsOf(standInPeople.otherAdmin.accountId)).toEqual([
      standInLeagues.otherDraft.slug,
    ]);
    expect(await slugsOf(standInPeople.stranger.accountId)).toEqual([]);
    expect(await slugsOf(standInPeople.coach.accountId)).toEqual(
      [standInLeagues.live.slug, standInLeagues.draft.slug].sort(),
    );
  });

  it('gives the roles held, and the whole-league ones apart', async () => {
    const rows = await ports.leaguesOfAccount(standInPeople.programScheduler.accountId);
    expect(rows).toEqual([
      expect.objectContaining({
        slug: standInLeagues.draft.slug,
        isOwner: false,
        roles: ['scheduler'],
        leagueWideRoles: [],
        onRoster: false,
      }),
    ]);
  });

  it('lists the member by roster places, and core hides the draft they play in', async () => {
    const rows = await ports.leaguesOfAccount(standInMemberAccountId);
    expect(rows.every((row) => row.onRoster && row.roles.length === 0)).toBe(true);
    expect(await shownTo(standInMemberAccountId)).toEqual(
      [standInLeagues.live.slug, standInLeagues.other.slug].sort(),
    );
    expect(await shownTo(standInPeople.coach.accountId)).toEqual([standInLeagues.live.slug]);
  });
});
