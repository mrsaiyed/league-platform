// The settings stage 2 declares (T5 §6). Each is declared once, here; the admin
// screen, the lookup and the command that sets one all read this list (T-98).
//
// Declared:
//   - the start page for members (U-5; P2 §3 makes "league home" the default);
//   - whether scorekeepers may score any game or only games assigned to them (P4 §4;
//     A-13: a new league starts with any game and can tighten it. The founder left
//     that starting value to the lead on 2026-11-13, who kept the recommendation).
//
// Not yet declared, because the spec gives no default for them and a default is a
// product decision (docs/build/STATUS.md, "Needs the founder"):
//   - the starting statistics level (S-22), and whether teams may choose their own.
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

export const declaredSettings = settingRegistry([membersStartPage, whoMayScore]);
