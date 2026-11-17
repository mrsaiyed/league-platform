// English interface text (T-187). Components ask for a key; they never hold the words.
// The keys live in files by area in ./en/, each in alphabetical order (step 2.188,
// record 072), and this file joins them into the one object `en`. A new key goes in its
// area's file in its alphabetical place; every other language must then have it too.
// Which file a key goes in, by the start of the key:
//   account.ts: account, access, code, confirm, device, email, forgot, password, problem, role,
//     signIn, signUp
//   activity.ts: activity
//   admin.ts: admin
//   admin-divisions.ts: adminDivisions
//   admin-games.ts: admin.games, admin.boxScore, admin.myGames
//   admin-import.ts: admin.import
//   admin-settings.ts: adminSettings, seasonSettings, setting
//   admin-teams.ts: adminTeams
//   error.ts: error
//   error-scheduling.ts: error.scheduling
//   game.ts: game, stat
//   schedule.ts: schedule
//   schedule-admin.ts: schedule.admin
//   site.ts: common, display, footer, front, home, nav, page, shell, site, standIn, standings,
//     stats, team, teams
//   tracker.ts: tracker
//   tracker-states.ts: tracker.refusal, tracker.notStarted, tracker.readOnly, tracker.reopen
// A new area of its own gets a file here, joined below in alphabetical order.
import { enAccount } from './en/account.ts';
import { enActivity } from './en/activity.ts';
import { enAdmin } from './en/admin.ts';
import { enAdminDivisions } from './en/admin-divisions.ts';
import { enAdminGames } from './en/admin-games.ts';
import { enAdminImport } from './en/admin-import.ts';
import { enAdminSettings } from './en/admin-settings.ts';
import { enAdminTeams } from './en/admin-teams.ts';
import { enError } from './en/error.ts';
import { enErrorScheduling } from './en/error-scheduling.ts';
import { enGame } from './en/game.ts';
import { enSchedule } from './en/schedule.ts';
import { enScheduleAdmin } from './en/schedule-admin.ts';
import { enSite } from './en/site.ts';
import { enTracker } from './en/tracker.ts';
import { enTrackerStates } from './en/tracker-states.ts';

export const en = {
  ...enAccount,
  ...enActivity,
  ...enAdmin,
  ...enAdminDivisions,
  ...enAdminGames,
  ...enAdminImport,
  ...enAdminSettings,
  ...enAdminTeams,
  ...enError,
  ...enErrorScheduling,
  ...enGame,
  ...enSchedule,
  ...enScheduleAdmin,
  ...enSite,
  ...enTracker,
  ...enTrackerStates,
} as const;

export type MessageKey = keyof typeof en;
