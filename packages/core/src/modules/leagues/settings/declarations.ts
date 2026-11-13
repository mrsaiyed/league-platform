// The settings stage 2 declares (T5 §6). Each is declared once, here; the admin
// screen, the lookup and the command that sets one all read this list (T-98).
//
// Declared: the start page for members (U-5; P2 §3 makes "league home" the default).
//
// Not yet declared, because the spec gives no default for them and a default is a
// product decision (docs/build/STATUS.md, "Needs the founder"):
//   - the starting statistics level (S-22), and whether teams may choose their own;
//   - whether scorekeepers may score any game or only games assigned to them (P4 §4).
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

export const declaredSettings = settingRegistry([membersStartPage]);
