// The cases the two-league harness runs (T-65): every query in ../queries and every
// command in core's registry. Importing this file registers them.
import {
  acceptInvitation,
  cancelInvitation,
  createLeague,
  clearSetting,
  clearSettingFor,
  createSeason,
  defineSetting,
  invite,
  setSetting,
  setSettingFor,
  settingRegistry,
  listAccess,
  listActivity,
  myAccess,
  resendInvitation,
  revokeGrant,
  renameShortName,
  setCurrentSeason as setCurrentSeasonCommand,
  setLeagueName,
  setLeagueStatus,
} from '@srleagues/core';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  deleteSettingValue,
  findCurrentLeague,
  findInvitation,
  findInvitationByTokenHash,
  findRoleGrant,
  hasPendingInvitation,
  insertActivity,
  insertInvitation,
  insertRoleGrant,
  listActiveGrantsOf,
  listActivityEntries,
  listOpenInvitations,
  listRoleGrants,
  markInvitationAccepted,
  markInvitationCancelled,
  renewInvitationLink,
  replaceInvitationLink,
  revokeRoleGrant,
  findProgramBySlug,
  findProgramId,
  findSeasonProgramId,
  insertJob,
  insertLeague,
  insertSeason,
  listPrograms,
  listSettingValues,
  renameLeagueSlug,
  setCurrentSeason,
  settleJob,
  updateLeagueName,
  updateLeagueStatus,
  writeSettingValue,
} from '../queries/index.ts';
import {
  harnessTx,
  inFreshLeague,
  registerCommandCase,
  runInScope,
} from './command-cases.test-helper.ts';
import './divisions-venues-cases.test-helper.ts';
import './teams-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';

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
  run: (scope) => findCurrentLeague(scope),
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

// Commands -----------------------------------------------------------------------

registerCommandCase(setLeagueName, harnessTx, {
  name: "set the league's name as its owner",
  input: () => ({ name: 'Renamed by the harness', version: 1 }),
});

registerCommandCase(renameShortName, harnessTx, {
  name: "rename the league's short name as its owner",
  input: () => ({ slug: 'harness-renamed', version: 1 }),
});

registerCommandCase(setLeagueStatus, harnessTx, {
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
    runInScope(setAtAnyLevel, harnessTx, scope, {
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
    runInScope(setAtAnyLevel, harnessTx, scope, {
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
    runInScope(clearAtAnyLevel, harnessTx, scope, {
      level: 'program',
      programId: target.programId,
      key: 'members.startPage',
      version: 1,
    }),
});

registerCommandCase(setCurrentSeasonCommand, harnessTx, {
  name: "make the target's season current",
  input: (target) => ({ seasonId: target.seasonId }),
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
  name: 'create a league owned by the run account, in a fresh league id',
  run: (scope) =>
    inFreshLeague(scope, (fresh) =>
      runInScope(createLeague, harnessTx, fresh, newLeagueInput(scope.accountId)),
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
        defaultProgram: { slug: 'main', name: 'Main', sportKey: 'basketball' },
      });
      // A refusal leaves the transaction unusable, as the commands treat it: roll back.
      if (typeof created === 'string') throw new Error(`insertLeague refused: ${created}`);
      return created;
    }),
});

registerIsolationCase({
  subject: renameLeagueSlug,
  name: "rename the scope's league",
  run: (scope) => renameLeagueSlug(scope, 'harness-renamed', 1, 12),
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

registerCommandCase(myAccess, harnessTx, {
  name: "read the run account's own access",
  input: () => ({}),
});
