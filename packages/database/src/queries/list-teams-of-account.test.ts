// listTeamsOfAccount: the teams of one season the transaction's own account has a roster
// place on now, through the person linked to the account's own profile. Not a place it
// left, a team or a person in the bin, a child it is the guardian of, another season's
// team, or anyone else's; nothing with no account set.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newAccount,
  newLeague,
  newPerson,
  newRosterEntry,
  newSeason,
  newTeam,
  one,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { listTeamsOfAccount } from './list-teams-of-account.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let league: MadeLeague;
let season: string;
let earlier: string;
let player: string;
let parent: string;
const teams: Record<string, string> = {};

/** A profile and its link for `accountId`, as create_own_profile (self) or a guardian makes it. */
async function profileOf(accountId: string, relation: 'self' | 'guardian'): Promise<string> {
  const profile = await one<{ id: string }>(
    pglite,
    "insert into profiles (first_name, last_name) values ('Made-up', 'Player') returning id",
  );
  await pglite.query(
    'insert into profile_access (account_id, profile_id, relation) values ($1, $2, $3)',
    [accountId, profile.id, relation],
  );
  return profile.id;
}

const teamsOf = (accountId: string | undefined, seasonId = season) =>
  withTransaction(db, { leagueId: league.leagueId, ...(accountId ? { accountId } : {}) }, (scope) =>
    listTeamsOfAccount(scope, seasonId),
  );

beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  league = await newLeague(pglite);
  season = await newSeason(pglite, league.leagueId, league.defaultProgramId);
  earlier = await newSeason(pglite, league.leagueId, league.defaultProgramId);
  for (const name of ['now', 'second', 'left', 'binned', 'earlier', 'child']) {
    teams[name] = await newTeam(pglite, league.leagueId, name === 'earlier' ? earlier : season);
  }
  player = await newAccount(pglite);
  parent = await newAccount(pglite);
  const me = await newPerson(pglite, league.leagueId, {
    profileId: await profileOf(player, 'self'),
  });
  for (const name of ['now', 'second', 'left', 'binned', 'earlier']) {
    await newRosterEntry(pglite, league.leagueId, teams[name] ?? '', me);
  }
  await pglite.query("update roster_entries set left_on = '2026-11-01' where team_id = $1", [
    teams['left'],
  ]);
  await pglite.query('update teams set deleted_at = now() where id = $1', [teams['binned']]);
  // The parent's child plays on another team: the parent has no place of their own.
  const child = await newPerson(pglite, league.leagueId, {
    profileId: await profileOf(parent, 'guardian'),
  });
  await newRosterEntry(pglite, league.leagueId, teams['child'] ?? '', child);
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('listTeamsOfAccount', () => {
  it("gives the season's teams the account has a place on now, and no other", async () => {
    expect(await teamsOf(player)).toEqual([teams['now'], teams['second']].sort());
    // The earlier season's team is that season's, asked for by its own season only.
    expect(await teamsOf(player, earlier)).toEqual([teams['earlier']]);
  });

  it("reads nothing for a guardian's child, another account or no account at all", async () => {
    expect(await teamsOf(parent)).toEqual([]);
    expect(await teamsOf(await newAccount(pglite))).toEqual([]);
    expect(await teamsOf(undefined)).toEqual([]);
  });

  it('drops a person in the bin', async () => {
    await pglite.query(
      `update people set deleted_at = now() where profile_id in
         (select profile_id from profile_access where account_id = $1)`,
      [player],
    );
    expect(await teamsOf(player)).toEqual([]);
    await pglite.query(
      `update people set deleted_at = null where profile_id in
         (select profile_id from profile_access where account_id = $1)`,
      [player],
    );
  });
});
