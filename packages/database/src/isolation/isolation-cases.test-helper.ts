// The cases the two-league harness runs (T-65): every query in ../queries and every
// command in core's registry. Importing this file registers them.
//
// A new area's cases go in a file of their own, `<area>-cases.test-helper.ts`, imported
// below in its alphabetical place; a new case of an area that has a file goes in that
// file. The imports here are kept in alphabetical order, never added at the end, so two
// steps rarely touch the same lines (step 2.188, record 072). The order changes nothing
// that is checked: every case runs on its own and is rolled back.
import {
  acceptInvitation,
  activityMatchOf,
  cancelInvitation,
  clearSetting,
  clearSettingFor,
  createLeague,
  createSeason,
  defineSetting,
  invite,
  listAccess,
  listActivity,
  myAccess,
  readInvitation,
  renameShortName,
  resendInvitation,
  revokeGrant,
  searchActivity,
  setCurrentSeason as setCurrentSeasonCommand,
  startSeason as startSeasonCommand,
  archiveSeason as archiveSeasonCommand,
  setLeagueAudience,
  setLeagueName,
  setLeagueProfile,
  publicNames,
  setLeagueStatus,
  setSetting,
  setSettingFor,
  settingRegistry,
} from '@srleagues/core';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import { transactionOf } from '../db/transaction-scope.ts';
import {
  deleteSettingValue,
  findCurrentLeague,
  findInvitation,
  findInvitationByTokenHash,
  findProgramBySlug,
  findProgramId,
  findRoleGrant,
  findSeasonProgramId,
  hasPendingInvitation,
  insertActivity,
  insertInvitation,
  insertJob,
  insertLeague,
  insertRoleGrant,
  insertSeason,
  listAccessNames,
  listActiveGrantsOf,
  listActivityEntries,
  listOpenInvitations,
  listPrograms,
  listRoleGrants,
  listSettingValues,
  markInvitationAccepted,
  markInvitationCancelled,
  renameLeagueSlug,
  renewInvitationLink,
  replaceInvitationLink,
  revokeRoleGrant,
  setCurrentSeason,
  settleJob,
  updateLeagueAudience,
  updateLeagueName,
  updateLeagueProfile,
  updateLeagueStatus,
  writeSettingValue,
} from '../queries/index.ts';
import './bin-cases.test-helper.ts';
import {
  harnessTx,
  inFreshLeague,
  registerCommandCase,
  runAsApp,
} from './command-cases.test-helper.ts';
import './divisions-venues-cases.test-helper.ts';
import './games-cases.test-helper.ts';
import './imports-cases.test-helper.ts';
import { moveOwnLeagueRowLast, setTargetLeagueApart } from './public-schedule-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import './league-removal-cases.test-helper.ts';
import './game-format-cases.test-helper.ts';
import './not-started-cases.test-helper.ts';
import './people-cases.test-helper.ts';
import './public-reads-cases.test-helper.ts';
import './public-schedule-cases.test-helper.ts';
import './schedule-draft-cases.test-helper.ts';
import './seasons-cases.test-helper.ts';
import './site-cases.test-helper.ts';
import './standings-cases.test-helper.ts';
import './teams-cases.test-helper.ts';

registerIsolationCase({
  subject: listPrograms,
  name: 'list the programs',
  run: (scope) => listPrograms(scope),
});

registerIsolationCase({
  subject: findProgramBySlug,
  name: "find by a short name only the target's program has",
  run: (scope, target) => findProgramBySlug(scope, target.programSlug),
});

registerIsolationCase({
  subject: findProgramBySlug,
  name: 'find by a short name both leagues use (the default program)',
  run: (scope) => findProgramBySlug(scope, 'main'),
});

registerIsolationCase({
  subject: findCurrentLeague,
  name: "read the scope's league",
  arrange: setTargetLeagueApart,
  run: async (scope) => {
    await moveOwnLeagueRowLast(scope);
    return findCurrentLeague(scope);
  },
});

registerIsolationCase({
  subject: insertJob,
  name: "record a job naming the target's season, keyed by the target's program",
  run: (scope, target) =>
    insertJob(scope, {
      type: 'notify.event',
      leagueId: scope.leagueId,
      ids: { seasonId: target.seasonId },
      dedupeKey: target.programId,
    }),
});

registerIsolationCase({
  subject: settleJob,
  name: "settle the target's held job with its own lease",
  run: (scope, target) => settleJob(scope, target.jobId, target.jobLeaseToken, { outcome: 'done' }),
});

registerIsolationCase({
  subject: updateLeagueName,
  name: "rename the scope's league",
  run: (scope) => updateLeagueName(scope, 'Renamed by the harness', 1),
});

registerIsolationCase({
  subject: updateLeagueProfile,
  name: "change the scope's league's profile (step 2.125)",
  run: (scope) =>
    updateLeagueProfile(
      scope,
      { contactEmail: 'harness@example.org', city: 'Harness town', timeZone: 'UTC', listed: true },
      1,
    ),
});

registerIsolationCase({
  subject: updateLeagueAudience,
  name: "change who plays in the scope's league (step 2.125)",
  run: (scope) => updateLeagueAudience(scope, 'adult', 1, true),
});

// Commands -----------------------------------------------------------------------

registerCommandCase(setLeagueName, harnessTx, {
  name: "set the league's name as its owner",
  input: () => ({ name: 'Renamed by the harness', version: 1 }),
});

registerCommandCase(setLeagueProfile, harnessTx, {
  name: "change the league's profile as its owner (step 2.125)",
  input: () => ({
    contactEmail: 'harness@example.org',
    city: 'Harness town',
    timeZone: 'UTC',
    listed: true,
    version: 1,
  }),
});

registerCommandCase(setLeagueAudience, harnessTx, {
  name: 'change who plays in the league as its owner (step 2.125)',
  input: () => ({ audience: 'adult' as const, confirmed: true, version: 1 }),
});

registerCommandCase(renameShortName, harnessTx, {
  name: "rename the league's short name as its owner",
  input: () => ({ slug: 'harness-renamed', version: 1 }),
});

// Publishing waits for the league's privacy choice (step 2.240), and the harness's league
// records a child: this case reads that choice as made, so it judges where publishing
// writes. What the checks read is in the harness itself (findLeagueContactEmail and the
// rest).
const namesChosenTx: typeof harnessTx = (scope, jobs) => {
  const tx = harnessTx(scope, jobs);
  const chosen = {
    level: 'league' as const,
    document: { version: 1, value: 'fullName' },
    version: 1,
  };
  return {
    ...tx,
    leagues: {
      ...tx.leagues,
      settingRows: async (key, places) =>
        key === publicNames.key ? [chosen] : tx.leagues.settingRows(key, places),
    },
  };
};

registerCommandCase(setLeagueStatus, namesChosenTx, {
  name: 'publish the league as its owner',
  input: () => ({ status: 'live', version: 1 }),
});

registerCommandCase(createSeason, harnessTx, {
  name: "add a season to the league's default program",
  input: () => ({ slug: 'harness-season', name: 'Harness season' }),
});

registerCommandCase(setSetting, harnessTx, {
  name: "set the league's start page for members as its owner",
  input: () => ({ level: 'league', key: 'members.startPage', value: 'myTeam', version: 1 }),
});

registerCommandCase(clearSetting, harnessTx, {
  name: "clear the league's start page for members as its owner",
  input: () => ({ level: 'league', key: 'members.startPage', version: 1 }),
});

// The product declares its one setting at the league only, so the program and season
// places are tried through the same commands over a setting that allows all three.
const reminderHours = defineSetting({
  key: 'notifications.reminderLeadHours',
  type: z.number().int().min(1).max(72),
  default: 24,
  levels: ['league', 'program', 'season'],
  permission: 'league.settings',
  label: 'setting.notifications.reminderLeadHours.label',
});
const startPageEverywhere = defineSetting({
  key: 'members.startPage',
  type: z.enum(['leagueHome', 'myTeam']),
  default: 'leagueHome',
  levels: ['league', 'program', 'season'],
  permission: 'league.settings',
  label: 'setting.members.startPage.label',
});
const allLevels = settingRegistry([reminderHours, startPageEverywhere]);
const setAtAnyLevel = setSettingFor(allLevels);
const clearAtAnyLevel = clearSettingFor(allLevels);

registerIsolationCase({
  subject: setSetting,
  name: "set a value at the target's program",
  run: (scope, target) =>
    runAsApp(setAtAnyLevel, harnessTx, scope, {
      level: 'program',
      programId: target.programId,
      key: reminderHours.key,
      value: 12,
      version: null,
    }),
});

registerIsolationCase({
  subject: setSetting,
  name: "set a value at the target's season",
  run: (scope, target) =>
    runAsApp(setAtAnyLevel, harnessTx, scope, {
      level: 'season',
      seasonId: target.seasonId,
      key: reminderHours.key,
      value: 12,
      version: null,
    }),
});

registerIsolationCase({
  subject: clearSetting,
  name: "clear the target's program value at version 1",
  run: (scope, target) =>
    runAsApp(clearAtAnyLevel, harnessTx, scope, {
      level: 'program',
      programId: target.programId,
      key: 'members.startPage',
      version: 1,
    }),
});

registerCommandCase(setCurrentSeasonCommand, harnessTx, {
  name: "make the target's season current",
  input: (target) => ({ seasonId: target.seasonId, version: 1 }),
});

registerCommandCase(startSeasonCommand, harnessTx, {
  name: "start a new season in the target's program, its teams and rosters carried",
  input: (target) => ({
    programId: target.programId,
    slug: 'harness-next-season',
    name: 'Harness next season',
    carry: 'teams-and-rosters',
  }),
});

registerCommandCase(archiveSeasonCommand, harnessTx, {
  name: "archive the target's season",
  input: (target) => ({ seasonId: target.seasonId, version: 1 }),
});

// Creating a league acts in a league that does not exist yet (its id is set first,
// record 008), so these two cases run in a fresh league inside the run's transaction,
// owned by the run's own account. The control run reaches the target through its
// owner account in the result.
const newLeagueInput = (accountId: string | null) => ({
  slug: 'harness-new-league',
  name: 'Harness new league',
  timeZone: 'America/Chicago',
  audience: 'adult',
  ownerAccountId: accountId ?? randomUUID(),
  sportKey: 'basketball',
});

registerIsolationCase({
  subject: createLeague,
  name: 'create a league owned by the run account, with its first season, in a fresh league id',
  run: (scope) =>
    inFreshLeague(scope, (fresh) =>
      runAsApp(createLeague, harnessTx, fresh, {
        ...newLeagueInput(scope.accountId),
        firstSeason: { slug: 'harness-first', name: 'Harness first season' },
      }),
    ),
});

registerIsolationCase({
  subject: insertLeague,
  name: 'insert a league and its default program, in a fresh league id',
  run: (scope) =>
    inFreshLeague(scope, async (fresh) => {
      const created = await insertLeague(fresh, {
        ...newLeagueInput(scope.accountId),
        listed: true,
        contactEmail: 'harness@example.test',
        city: 'Harness City',
        defaultProgram: { slug: 'main', name: 'Main', sportKey: 'basketball' },
      });
      // A refusal leaves the transaction unusable, as the commands treat it: roll back.
      if (typeof created === 'string') throw new Error(`insertLeague refused: ${created}`);
      return created;
    }),
});

// Step 2.224, part 3: the scope's league row is moved after the target's (which the
// database then reads first) and the target's version made the one the scope's row then
// has (2: the arrange holds the trigger that counts versions), so a read or a rename that
// lost its `where id = scope.leagueId` meets the target's row: the old name kept for
// forwarding is then the target's, or both rows take the new name and the database refuses
// it. That refusal leaves the transaction unusable, as the caller would roll it back: the
// case rolls back to a savepoint, so the run can still be judged.
registerIsolationCase({
  subject: renameLeagueSlug,
  name: "rename the scope's league, its row moved after the target's",
  arrange: (inTarget) =>
    transactionOf(inTarget)
      .updateTable('leagues')
      .set({ version: 2 })
      .where('id', '=', inTarget.leagueId)
      .execute(),
  compareWrites: true,
  run: async (scope) => {
    await moveOwnLeagueRowLast(scope);
    const trx = transactionOf(scope);
    const own = await trx
      .selectFrom('leagues')
      .select('version')
      .where('id', '=', scope.leagueId)
      .executeTakeFirst();
    await sql`savepoint rename_league`.execute(trx);
    try {
      const renamed = await renameLeagueSlug(scope, 'harness-renamed', own?.version ?? 1, 12);
      await sql`${sql.raw(renamed === 'taken' ? 'rollback to' : 'release')} savepoint rename_league`.execute(
        trx,
      );
      return renamed;
    } catch (thrown) {
      await sql`rollback to savepoint rename_league`.execute(trx);
      throw thrown;
    }
  },
});

registerIsolationCase({
  subject: updateLeagueStatus,
  name: "set the scope's league's state",
  run: (scope) => updateLeagueStatus(scope, 'live', 1),
});

registerIsolationCase({
  subject: findProgramId,
  name: "find the scope's default program",
  run: (scope) => findProgramId(scope, undefined),
});

registerIsolationCase({
  subject: findProgramId,
  name: "find the target's program by its id",
  run: (scope, target) => findProgramId(scope, target.programId),
});

registerIsolationCase({
  subject: insertSeason,
  name: "add a season to the scope's default program",
  run: async (scope) => {
    const programId = await findProgramId(scope, undefined);
    if (programId === undefined) throw new Error('no default program in scope');
    return insertSeason(scope, {
      programId,
      slug: 'harness-season',
      name: 'Harness season',
      startsOn: null,
      endsOn: null,
    });
  },
});

registerIsolationCase({
  subject: findSeasonProgramId,
  name: "find the program of the target's season",
  run: (scope, target) => findSeasonProgramId(scope, target.seasonId),
});

registerIsolationCase({
  subject: setCurrentSeason,
  name: "make the target's season current",
  run: (scope, target) => setCurrentSeason(scope, target.seasonId),
});

// Setting values (step 2.14) ---------------------------------------------------------

registerIsolationCase({
  subject: listSettingValues,
  name: "read a key at the scope's league and the target's program and season",
  run: (scope, target) =>
    listSettingValues(scope, 'members.startPage', {
      programId: target.programId,
      seasonId: target.seasonId,
    }),
});

registerIsolationCase({
  subject: writeSettingValue,
  name: "add a value at the scope's league",
  run: (scope) =>
    writeSettingValue(
      scope,
      { level: 'league' },
      'notifications.reminderLeadHours',
      { version: 1, value: 12 },
      null,
    ),
});

registerIsolationCase({
  subject: writeSettingValue,
  name: "change the target's program value at version 1",
  run: (scope, target) =>
    writeSettingValue(
      scope,
      { level: 'program', programId: target.programId },
      'members.startPage',
      { version: 1, value: 'changed' },
      1,
    ),
});

registerIsolationCase({
  subject: writeSettingValue,
  name: "add a value at the target's program",
  run: (scope, target) =>
    writeSettingValue(
      scope,
      { level: 'program', programId: target.programId },
      'notifications.reminderLeadHours',
      { version: 1, value: 12 },
      null,
    ),
});

registerIsolationCase({
  subject: writeSettingValue,
  name: "add a value at the target's season",
  run: (scope, target) =>
    writeSettingValue(
      scope,
      { level: 'season', seasonId: target.seasonId },
      'notifications.reminderLeadHours',
      { version: 1, value: 12 },
      null,
    ),
});

registerIsolationCase({
  subject: deleteSettingValue,
  name: "clear the target's program value at version 1",
  run: (scope, target) =>
    deleteSettingValue(
      scope,
      { level: 'program', programId: target.programId },
      'members.startPage',
      1,
    ),
});

registerIsolationCase({
  subject: deleteSettingValue,
  name: "clear the target's season value at version 1",
  run: (scope, target) =>
    deleteSettingValue(
      scope,
      { level: 'season', seasonId: target.seasonId },
      'members.startPage',
      1,
    ),
});

registerIsolationCase({
  subject: deleteSettingValue,
  name: "clear the scope's league value at version 1",
  run: (scope) => deleteSettingValue(scope, { level: 'league' }, 'members.startPage', 1),
});

// Access (step 1.12) ------------------------------------------------------------------

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
/** The run's account, or one that does not exist when the run has none. */
const actor = (accountId: string | null) => accountId ?? randomUUID();

registerIsolationCase({
  subject: listActiveGrantsOf,
  name: "list the target's member's grants",
  run: (scope, target) => listActiveGrantsOf(scope, target.memberId),
});

registerIsolationCase({
  subject: listRoleGrants,
  name: "list the scope's grants",
  run: (scope) => listRoleGrants(scope),
});

registerIsolationCase({
  subject: listAccessNames,
  name: "list the names on the scope's access list (record 052)",
  run: (scope) => listAccessNames(scope),
});

registerIsolationCase({
  subject: findRoleGrant,
  name: "find the target's member's grant",
  run: (scope, target) => findRoleGrant(scope, target.memberGrantId),
});

registerIsolationCase({
  subject: insertRoleGrant,
  name: 'give the run account a role in the scope',
  run: (scope) =>
    insertRoleGrant(scope, {
      accountId: actor(scope.accountId),
      role: 'scheduler',
      scope: { type: 'league' },
      grantedByAccountId: null,
    }),
});

registerIsolationCase({
  subject: revokeRoleGrant,
  name: "end the target's member's grant",
  run: (scope, target) => revokeRoleGrant(scope, target.memberGrantId, actor(scope.accountId)),
});

registerIsolationCase({
  subject: insertInvitation,
  name: 'invite someone to the scope',
  run: (scope) =>
    insertInvitation(scope, {
      email: 'harness-invitee@example.test',
      role: 'editor',
      scope: { type: 'league' },
      tokenHash: sha256('harness'),
      invitedByAccountId: actor(scope.accountId),
      lifetimeDays: 14,
    }),
});

registerIsolationCase({
  subject: findInvitation,
  name: "find the target's invitation by id",
  run: (scope, target) => findInvitation(scope, target.invitationId),
});

registerIsolationCase({
  subject: findInvitationByTokenHash,
  name: "find the target's invitation by its link",
  run: (scope, target) => findInvitationByTokenHash(scope, sha256(target.invitationToken)),
});

registerIsolationCase({
  subject: hasPendingInvitation,
  name: "ask about the target's invitee",
  run: (scope, target) =>
    hasPendingInvitation(scope, target.invitationEmail, 'scheduler', { type: 'league' }),
});

registerIsolationCase({
  subject: renewInvitationLink,
  name: "renew the target's invitation",
  run: (scope, target) => renewInvitationLink(scope, target.invitationId, sha256('renewed'), 14),
});

registerIsolationCase({
  subject: replaceInvitationLink,
  name: "replace the link of the target's invitation",
  run: (scope, target) => replaceInvitationLink(scope, target.invitationId, sha256('replaced')),
});

registerIsolationCase({
  subject: markInvitationCancelled,
  name: "cancel the target's invitation",
  run: (scope, target) => markInvitationCancelled(scope, target.invitationId),
});

registerIsolationCase({
  subject: markInvitationAccepted,
  name: "accept the target's invitation as the run account",
  run: (scope, target) =>
    markInvitationAccepted(
      scope,
      target.invitationId,
      sha256(target.invitationToken),
      actor(scope.accountId),
    ),
});

registerIsolationCase({
  subject: listOpenInvitations,
  name: "list the scope's open invitations",
  run: (scope) => listOpenInvitations(scope),
});

registerIsolationCase({
  subject: insertActivity,
  name: "add to the scope's activity log",
  run: (scope) =>
    insertActivity(scope, {
      actorAccountId: scope.accountId,
      action: 'harness.test',
      targetType: null,
      targetId: null,
      summary: 'activity.harness.test',
      details: {},
    }),
});

registerIsolationCase({
  subject: listActivityEntries,
  name: "read the scope's activity log",
  run: (scope) => listActivityEntries(scope, 50, undefined, { type: 'league' }),
});

registerIsolationCase({
  subject: listActivityEntries,
  name: "search the scope's activity log by kind and time (step 2.77)",
  run: (scope) =>
    listActivityEntries(
      scope,
      50,
      undefined,
      { type: 'league' },
      {
        // The seeded entry is `league.renamed`.
        match: { ...activityMatchOf('access'), also: ['league.renamed'] },
        from: '2000-01-01T00:00:00Z',
        after: { at: '2000-01-01T00:00:00Z', id: '00000000-0000-7000-8000-000000000000' },
      },
    ),
});

registerCommandCase(invite, harnessTx, {
  name: 'invite someone to the league as its owner',
  input: () => ({ email: 'harness-invitee@example.test', role: 'editor' }),
});

registerCommandCase(invite, harnessTx, {
  name: "invite someone to the target's program",
  input: (target) => ({
    email: 'harness-invitee@example.test',
    role: 'scheduler',
    scope: { type: 'program', id: target.programId },
  }),
});

registerCommandCase(resendInvitation, harnessTx, {
  name: "re-send the target's invitation",
  input: (target) => ({ invitationId: target.invitationId }),
});

registerCommandCase(cancelInvitation, harnessTx, {
  name: "cancel the target's invitation",
  input: (target) => ({ invitationId: target.invitationId }),
});

registerCommandCase(acceptInvitation, harnessTx, {
  name: "accept the target's invitation with its link",
  input: (target) => ({ token: target.invitationToken }),
});

registerCommandCase(revokeGrant, harnessTx, {
  name: "remove the target's member's access",
  input: (target) => ({ grantId: target.memberGrantId }),
});

registerCommandCase(listAccess, harnessTx, {
  name: "list who has access to the scope's league",
  input: () => ({}),
});

registerCommandCase(listActivity, harnessTx, {
  name: "read the scope's activity log",
  input: () => ({}),
});

registerCommandCase(searchActivity, harnessTx, {
  name: "search the league's activity log",
  input: () => ({}),
});

registerCommandCase(myAccess, harnessTx, {
  name: "read the run account's own access",
  input: () => ({}),
});

registerCommandCase(readInvitation, harnessTx, {
  name: "read what the target's invitation link offers",
  input: (target) => ({ token: target.invitationToken }),
});
