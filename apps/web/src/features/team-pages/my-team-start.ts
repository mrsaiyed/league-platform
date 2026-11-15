// The team a league whose start page is "my team" sends someone to (U-5), from the ports:
// the setting, the current season's teams, the account's grants and roster places, and
// the team the device remembers. Undefined keeps them on the league home.
//
// On the database a member's roster places are not read until step 2.93 part 3 (record
// 069): until then a signed-in member there is shown the league home itself, as a
// visitor is, never the error page. Part 3 puts their team page there.
import type { AccessHolder } from '@srleagues/core';
import { NotOnTheDatabaseYet } from '../../server/not-on-the-database-yet.ts';
import type { WebPorts } from '../../server/ports.ts';
import { chooseSeason } from '../stats-pages/index.ts';
import { chooseMyTeam, teamIdsFromGrants } from './start-page.ts';

export type MyTeamStartInput = {
  readonly leagueId: string;
  /** The signed-in account, or null for a visitor. */
  readonly accountId: string | null;
  /** The signed-in account's grants; asked only when there is one. */
  readonly holder: () => Promise<AccessHolder | undefined>;
  /** The short name this device remembered, as the cookie held it. */
  readonly rememberedSlug: string | undefined;
};

/** The short name of the team to start on, or undefined for the league home. */
export async function myTeamStart(
  ports: Pick<WebPorts, 'publicTeams' | 'publicStats'>,
  input: MyTeamStartInput,
): Promise<string | undefined> {
  const { leagueId, accountId } = input;
  if ((await ports.publicTeams.startPageOf(leagueId)) !== 'myTeam') return undefined;
  const season = chooseSeason(await ports.publicStats.seasonsOf(leagueId), undefined);
  if (season === undefined) return undefined;
  const teams = await ports.publicStats.readStoreOf(leagueId).teams(season.id);
  if (accountId === null) {
    return chooseMyTeam({
      teams,
      grantTeamIds: [],
      rosterTeamIds: [],
      rememberedSlug: input.rememberedSlug,
    });
  }
  const holder = await input.holder();
  let rosterTeamIds: readonly string[];
  try {
    rosterTeamIds = await ports.publicTeams.teamIdsOfAccount(leagueId, season.id, accountId);
  } catch (error) {
    if (error instanceof NotOnTheDatabaseYet) return undefined;
    throw error;
  }
  return chooseMyTeam({
    teams,
    grantTeamIds: teamIdsFromGrants(holder),
    rosterTeamIds,
    rememberedSlug: input.rememberedSlug,
  });
}
