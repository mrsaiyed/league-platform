// The settings stage 2 declares (T5 §6). Each is declared once, here; the admin
// screen, the lookup and the command that sets one all read this list (T-98).
//
// Declared:
//   - the start page for members (U-5; P2 §3 makes "league home" the default);
//   - whether scorekeepers may score any game or only games assigned to them (P4 §4;
//     A-13: a new league starts with any game and can tighten it. The founder left
//     that starting value to the lead on 2026-11-13, who kept the recommendation);
//   - the statistics level a new team starts with (S-22; S-23, the founder: everyone
//     can see its players' statistics), and whether teams may choose their own (S-24:
//     yes, the league can switch it off).
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

export const declaredSettings = settingRegistry([
  membersStartPage,
  whoMayScore,
  startingStatsLevel,
  teamsMayChooseStatsLevel,
]);
