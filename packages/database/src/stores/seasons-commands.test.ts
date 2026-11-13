// The season commands of step 2.15 against the real database: each call is one
// transaction, committed on success and rolled back on a refusal.
import type { PGlite } from '@electric-sql/pglite';
import { defaultSeasonRules, seasonRulesPreset } from '@srleagues/contracts';
import {
  getSeason,
  setSeasonRosterSettings,
  setSeasonRules,
  updateSeason,
  type CommandDeps,
  type Job,
  type LeaguesTx,
  type StandingsTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newLeague,
  newPerson,
  newProgram,
  newRosterEntry,
  newSeason,
  newTeam,
  one,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { gamesStore } from './games-store.ts';
import { standingsStore } from './standings-store.ts';
import { leaguesStore } from './leagues-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<LeaguesTx & StandingsTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  deps = {
    transaction: commandTransaction(db, (scope) => ({
      jobs: { enqueue: async (_job: Job) => {} },
      leagues: leaguesStore(scope),
      divisions: divisionsStore(scope),
      games: gamesStore(scope),
      standings: standingsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    })),
    events: [],
    log: () => {},
    now: () => 0,
  };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const as = (leagueId: string, accountId: string) => ({ leagueId, accountId, requestId: 'r-1' });
const seasonRow = (id: string) =>
  one<{
    name: string;
    status: string;
    is_current: boolean;
    version: number;
    unique_jerseys: boolean;
    rules: unknown;
  }>(
    pglite,
    'select name, status, is_current, version, unique_jerseys, rules from seasons where id = $1',
    [id],
  );

async function setUp() {
  const league = await newLeague(pglite);
  const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId);
  return { league, seasonId, owner: as(league.leagueId, league.ownerId) };
}

describe('season commands on the database', () => {
  it('edits a season and makes it current, and a second admin with the old version gets a conflict', async () => {
    const { league, seasonId, owner } = await setUp();
    const other = await newSeason(pglite, league.leagueId, league.defaultProgramId, {
      isCurrent: true,
    });
    const saved = await updateSeason(
      owner,
      {
        seasonId,
        version: 1,
        name: 'Winter',
        status: 'active',
        current: true,
        startsOn: '2027-01-01',
      },
      deps,
    );
    expect(saved).toEqual({ ok: true, value: { version: 2 } });
    expect(await seasonRow(seasonId)).toMatchObject({
      name: 'Winter',
      status: 'active',
      is_current: true,
    });
    expect((await seasonRow(other)).is_current).toBe(false);
    expect(
      await updateSeason(owner, { seasonId, version: 1, name: 'Other admin' }, deps),
    ).toMatchObject({
      error: { code: 'changed-since-read' },
    });
    expect((await seasonRow(seasonId)).name).toBe('Winter');
  });

  it('saves valid rules, refuses invalid ones, and the switch is the real column', async () => {
    const { seasonId, owner } = await setUp();
    const rules = seasonRulesPreset('high-school');
    rules.rosters.uniqueJerseys = true;
    expect(await setSeasonRules(owner, { seasonId, version: 1, rules }, deps)).toEqual({
      ok: true,
      value: { version: 2 },
    });
    expect(await seasonRow(seasonId)).toMatchObject({ unique_jerseys: true, rules });
    const bad = { ...defaultSeasonRules(), tiebreakers: ['coin-flip', 'head-to-head'] };
    expect(await setSeasonRules(owner, { seasonId, version: 2, rules: bad }, deps)).toMatchObject({
      error: { code: 'invalid-input' },
    });
    expect((await seasonRow(seasonId)).version).toBe(2);
    const shown = await getSeason(owner, { seasonId }, deps);
    expect(shown).toMatchObject({ ok: true, value: { rulesSaved: true, version: 2 } });
    if (shown.ok) expect('programId' in shown.value).toBe(false);
  });

  it('refuses the unique-jersey switch while a team has a number worn twice, and saves nothing', async () => {
    const { league, seasonId, owner } = await setUp();
    const team = await newTeam(pglite, league.leagueId, seasonId);
    await newRosterEntry(pglite, league.leagueId, team, await newPerson(pglite, league.leagueId), {
      jersey: '7',
    });
    await newRosterEntry(pglite, league.leagueId, team, await newPerson(pglite, league.leagueId), {
      jersey: '7',
    });
    expect(
      await setSeasonRosterSettings(owner, { seasonId, version: 1, uniqueJerseys: true }, deps),
    ).toMatchObject({ error: { code: 'unique-jerseys-clash' } });
    expect(await seasonRow(seasonId)).toMatchObject({ unique_jerseys: false, version: 1 });
    expect(
      await setSeasonRosterSettings(owner, { seasonId, version: 1, minSize: 5, maxSize: 10 }, deps),
    ).toMatchObject({ ok: true });
  });

  it('names the program only when the league has more than one (U-3)', async () => {
    const { league, seasonId, owner } = await setUp();
    await newProgram(pglite, league.leagueId);
    const shown = await getSeason(owner, { seasonId }, deps);
    expect(shown).toMatchObject({ ok: true, value: { programId: league.defaultProgramId } });
  });

  it("never reaches another league's season", async () => {
    const { owner } = await setUp();
    const other = await newLeague(pglite);
    const otherSeason = await newSeason(pglite, other.leagueId, other.defaultProgramId);
    expect(
      await updateSeason(owner, { seasonId: otherSeason, version: 1, name: 'X' }, deps),
    ).toMatchObject({
      error: { code: 'season-not-found' },
    });
    expect(
      await setSeasonRules(
        owner,
        { seasonId: otherSeason, version: 1, rules: defaultSeasonRules() },
        deps,
      ),
    ).toMatchObject({ error: { code: 'season-not-found' } });
    expect((await seasonRow(otherSeason)).name).not.toBe('X');
  });
});
