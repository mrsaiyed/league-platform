// The settings stage 2 declares (T5 §6). Each is declared once, here; the admin
// screen, the lookup and the command that sets one all read this list (T-98).
//
// Declared:
//   - the start page for members (U-5; P2 §3 makes "league home" the default);
//   - whether scorekeepers may score any game or only games assigned to them (P4 §4;
//     A-13: a new league starts with any game and can tighten it. The founder left
//     that starting value to the lead on 2026-11-13, who kept the recommendation);
//   - how long after the end the scorekeeper who ended a game may reopen it (S-36);
//   - the statistics level a new team starts with (S-22; S-23, the founder: everyone
//     can see its players' statistics), and whether teams may choose their own (S-24:
//     yes, the league can switch it off);
//   - how names show on public pages (R-14, R-24: full names, first name and last
//     initial, which every league starts with, or hidden; switching to full names asks
//     the admin to confirm the league has the permission it needs), and whether an
//     adult may ask to appear as initials (R-15: off to start; R-25: a child always
//     may). The people module reads both (readNamePolicy, T-81).
import { z } from 'zod';
import { defineSetting, settingRegistry } from './define-setting.ts';

export const startPageChoices = ['leagueHome', 'myTeam'] as const;

export const membersStartPage = defineSetting({
  key: 'members.startPage',
  type: z.enum(startPageChoices),
  default: 'leagueHome',
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.members.startPage.label',
});

/**
 * Who may score a game (P4 §4, P7 §5.1): any scorekeeper of the league, or only the
 * scorekeepers assigned to it. Owners, admins and schedulers may score any game they
 * reach whatever this says; it limits the scorekeeper role only (the games module).
 */
export const whoMayScoreChoices = ['anyScorekeeper', 'assignedOnly'] as const;

export const whoMayScore = defineSetting({
  key: 'games.whoMayScore',
  type: z.enum(whoMayScoreChoices),
  default: 'anyScorekeeper',
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.games.whoMayScore.label',
});

/**
 * How long after the end the scorekeeper who ended a tracked game may reopen it, with a
 * reason (S-36, decided for you: 30 minutes to begin with; P7 §5.5). 0 means never:
 * then only those who may correct games reopen one, as they may at any time. At most a
 * day (1440 minutes): past that a reopening is an admin's correction, not an undo of
 * one wrong tap (record 060, T-263). The games module reads it (reopen-tracked-game.ts).
 */
export const scorekeeperReopenMinutes = defineSetting({
  key: 'games.scorekeeperReopenMinutes',
  type: z.number().int().min(0).max(1440),
  default: 30,
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.games.scorekeeperReopenMinutes.label',
});

/**
 * Who sees a team's players' statistics (S-22) that can be chosen today: everyone, or
 * the team's staff and the league's admins. The two levels between (the league's
 * signed-in members, the team's own players and parents) arrive with accounts in stage 4.
 */
export const statsLevelChoices = ['everyone', 'staff'] as const;

/** The level a team added without one starts at (S-22, S-23: everyone). */
export const startingStatsLevel = defineSetting({
  key: 'teams.startingStatsLevel',
  type: z.enum(statsLevelChoices),
  default: 'everyone',
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.teams.startingStatsLevel.label',
});

/**
 * Whether a team's own people may choose who sees its players' statistics (S-22,
 * S-24: yes). When it is switched off, only the league's owner and admins change a
 * team's level.
 */
export const teamsMayChooseStatsLevel = defineSetting({
  key: 'teams.mayChooseStatsLevel',
  type: z.boolean(),
  default: true,
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.teams.mayChooseStatsLevel.label',
});

/**
 * How children's names show on public pages (R-14, R-24, T-81): full names, first name
 * and last initial (the start), or hidden (by jersey number only). Adults are shown by
 * full name unless they ask otherwise (R-15). A person whose age the league does not
 * know counts as a child in a youth or mixed league. A child's own request for less
 * (initials, or removed) always wins over this (R-25).
 */
export const publicNamesChoices = ['fullName', 'firstNameLastInitial', 'hidden'] as const;

export const publicNames = defineSetting({
  key: 'privacy.publicNames',
  type: z.enum(publicNamesChoices),
  default: 'firstNameLastInitial',
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.privacy.publicNames.label',
  // R-14: the admin confirms the league has the permission it needs for full names.
  confirm: ['fullName'],
  // R-26: from the most shown to the least; a move down the list works even while the
  // league is archived or suspended.
  protectiveOrder: ['fullName', 'firstNameLastInitial', 'hidden'],
});

/**
 * R-15: whether an adult may ask to appear as initials. Off until the league switches it
 * on. A request for a child always takes effect, whatever this says (R-25). It decides
 * only whether a new adult request may be recorded: switching it off takes no one's
 * recorded initials away (R-27).
 */
export const playersMayAskForInitials = defineSetting({
  key: 'privacy.playersMayAskForInitials',
  type: z.boolean(),
  default: false,
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.privacy.playersMayAskForInitials.label',
});

export const declaredSettings = settingRegistry([
  membersStartPage,
  whoMayScore,
  scorekeeperReopenMinutes,
  startingStatsLevel,
  teamsMayChooseStatsLevel,
  publicNames,
  playersMayAskForInitials,
]);
