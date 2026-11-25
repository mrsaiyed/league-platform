// Every command that names an archived-season check (O-12, step 2.130, T-377) is in this
// table, and its check, run against the real database, refuses it in an archived season.
// The list of guarded commands is taken from the code (each command says whether it names
// a check), so a new guarded command without a row here fails, and so does a row for a
// command whose check was removed. The framework's own test shows that a check that says
// yes refuses the command with `season-archived` before it runs.
import type { PGlite } from '@electric-sql/pglite';
import * as core from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newDivision,
  newGame,
  newLeague,
  newPerson,
  newRosterEntry,
  newSeason,
  newStage,
  newTeam,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { binStore } from './bin-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { gamesStore } from './games-store.ts';
import { importsStore } from './imports-store.ts';
import { leaguesStore } from './leagues-store.ts';
import { liveGamesStore } from './live-games-store.ts';
import { schedulingStore } from './scheduling-store.ts';
import { scoringSessionsStore } from './scoring-sessions-store.ts';
import { teamsStore } from './teams-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** What a command's check reads to find its season. */
type Reads =
  | 'season'
  | 'setting'
  | 'division'
  | 'team'
  | 'entry'
  | 'game'
  | 'import'
  | 'binned-team'
  | 'binned-game'
  | 'unexplained';

const guarded: Readonly<Record<string, Reads>> = {
  'games.apply_tracker_commands': 'game',
  'games.assign_scorekeeper': 'game',
  'games.cancel_game': 'game',
  'games.clear_game_format': 'game',
  'games.correct_tracked_box_score': 'game',
  'games.end_tracked_game': 'game',
  'games.give_game_format': 'game',
  'games.mark_not_started': 'game',
  'games.open_scoring_session': 'game',
  'games.postpone_game': 'game',
  'games.put_game_back': 'game',
  'games.record_final_score': 'game',
  'games.record_forfeit': 'game',
  'games.release_scoring_session': 'game',
  'games.renew_scoring_session': 'game',
  'games.reopen_own_result': 'game',
  'games.set_box_score': 'game',
  'games.take_over_scoring': 'game',
  'games.unassign_scorekeeper': 'game',
  'imports.apply_fixture_import': 'import',
  'imports.record_imported_scores': 'import',
  'imports.start_fixture_import': 'season',
  'imports.undo_fixture_import': 'import',
  'leagues.clear_setting': 'setting',
  'leagues.create_division': 'season',
  'leagues.remove_division': 'division',
  'leagues.reorder_divisions': 'season',
  'leagues.restore_division': 'division',
  'leagues.restore_game': 'binned-game',
  'leagues.restore_team': 'binned-team',
  'leagues.set_season_roster_settings': 'season',
  'leagues.set_season_rules': 'season',
  'leagues.set_setting': 'setting',
  'leagues.update_division': 'division',
  'leagues.update_season': 'season',
  'scheduling.add_draft_game': 'season',
  'scheduling.add_draft_round': 'season',
  'scheduling.change_draft_round_date': 'season',
  'scheduling.discard_schedule_draft': 'season',
  'scheduling.move_draft_game': 'season',
  'scheduling.publish_schedule': 'season',
  'scheduling.put_back_draft_game': 'season',
  'scheduling.remove_draft_game': 'season',
  'scheduling.remove_draft_round': 'season',
  'scheduling.rename_draft_round': 'season',
  'scheduling.set_draft_recording': 'season',
  'scheduling.swap_draft_games': 'season',
  'standings.record_coin_flip': 'unexplained',
  'standings.remove_adjustment': 'unexplained',
  'standings.remove_coin_flip': 'unexplained',
  'teams.add_to_roster': 'team',
  'teams.change_roster_entry': 'entry',
  'teams.create_team': 'season',
  'teams.mark_left': 'entry',
  'teams.mark_team_left': 'team',
  'teams.put_back_on_roster': 'team',
  'teams.remove_team': 'team',
  'teams.reorder_roster': 'team',
  'teams.set_stats_visibility': 'team',
  'teams.undo_team_left': 'team',
  'teams.update_team': 'team',
};

type GuardedCommand = {
  readonly commandName: string;
  readonly archivedSeasonCheck: NonNullable<
    core.Command<unknown, never, never>['archivedSeasonCheck']
  >;
};

/** The commands the core exports that name an archived-season check. */
function guardedCommands(): readonly GuardedCommand[] {
  const found: GuardedCommand[] = [];
  for (const value of Object.values(core)) {
    if (typeof value !== 'function' || !('commandName' in value)) continue;
    if (!('archivedSeasonCheck' in value) || typeof value.archivedSeasonCheck !== 'function') {
      continue;
    }
    if (typeof value.commandName !== 'string') continue;
    const check = value.archivedSeasonCheck as GuardedCommand['archivedSeasonCheck'];
    found.push({ commandName: value.commandName, archivedSeasonCheck: check });
  }
  return found;
}

describe('every guarded command is refused in an archived season (O-12)', () => {
  it('has a row for each command that names a check, and each check refuses it', async () => {
    const commands = guardedCommands();
    expect(commands.map((c) => c.commandName).sort()).toEqual(Object.keys(guarded).sort());

    const league = await newLeague(pglite);
    const L = league.leagueId;
    const owner = { leagueId: L, accountId: league.ownerId, requestId: 'r-1' };
    const transaction = commandTransaction(db, (scope) => ({
      jobs: { enqueue: async () => {} },
      leagues: leaguesStore(scope),
      divisions: divisionsStore(scope),
      games: gamesStore(scope),
      liveGames: liveGamesStore(scope),
      scoringSessions: scoringSessionsStore(scope),
      scheduling: schedulingStore(scope),
      imports: importsStore(scope),
      bin: binStore(scope),
      clock: { now: () => Date.now() },
      teams: teamsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    }));
    const seasonId = await newSeason(pglite, L, league.defaultProgramId, { isCurrent: true });
    const divisionId = await newDivision(pglite, L, seasonId, { name: 'East' });
    const teamId = await newTeam(pglite, L, seasonId, { divisionId });
    const awayId = await newTeam(pglite, L, seasonId);
    const binnedTeamId = await newTeam(pglite, L, seasonId);
    const rosterEntryId = await newRosterEntry(pglite, L, teamId, await newPerson(pglite, L));
    const stageId = await newStage(pglite, L, seasonId);
    const game = () =>
      newGame(pglite, { leagueId: L, seasonId, stageId, homeTeamId: teamId, awayTeamId: awayId });
    const gameId = await game();
    const binnedGameId = await game();
    const started = await core.startFixtureImport(
      owner,
      { seasonId, fileName: null, fileText: 'Date,Time,Home,Away\n2027-01-02,18:00,Home,Away\n' },
      { transaction, events: [], log: () => {}, now: () => 0 },
    );
    if (!started.ok) throw new Error(started.error.code);
    const importId = started.value.importId;
    await pglite.query('update teams set deleted_at = now() where id = $1', [binnedTeamId]);
    await pglite.query('update games set deleted_at = now() where id = $1', [binnedGameId]);
    await pglite.query(`update seasons set status = 'completed' where id = $1`, [seasonId]);

    const inputs: Readonly<Record<Reads, Readonly<Record<string, unknown>>>> = {
      season: { seasonId },
      setting: { level: 'season', seasonId },
      division: { divisionId },
      team: { teamId },
      entry: { rosterEntryId },
      game: { gameId },
      import: { importId },
      'binned-team': { teamId: binnedTeamId },
      'binned-game': { gameId: binnedGameId },
      unexplained: { seasonId },
    };
    const notRefused: string[] = [];
    for (const command of commands) {
      const reads = guarded[command.commandName];
      if (reads === undefined) continue;
      const refused = await transaction(owner, (tx) =>
        command.archivedSeasonCheck(inputs[reads] as never, tx as never, owner),
      );
      if (!refused) notRefused.push(command.commandName);
    }
    expect(notRefused).toEqual([]);
  });
});
