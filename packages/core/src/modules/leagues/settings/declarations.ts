// The settings stage 2 declares (T5 §6). Each is declared once, here; the admin
// screen, the lookup and the command that sets one all read this list (T-98).
//
// Declared:
//   - the start page for members (U-5; P2 §3 makes "league home" the default);
//   - whether scorekeepers may score any game or only games assigned to them (P4 §4;
//     A-13: a new league starts with any game and can tighten it. The founder left
//     that starting value to the lead on 2026-11-13, who kept the recommendation);
//   - how long after the end the scorekeeper who ended a game may reopen it (S-36);
//   - whether scorekeepers may change a game's format before it starts (S-35: on to
//     begin with; an admin may always give a game its own format, step 2.119);
//   - the statistics level a new team starts with (S-22; S-23, the founder: everyone
//     can see its players' statistics), and whether teams may choose their own (S-24:
//     yes, the league can switch it off);
//   - the least games a player needs to be ranked among the leaders (P7 §6; 3 to start,
//     decided for you at step 2.93 part 3);
//   - how names show on public pages (R-24, R-29: full names, first name and last
//     initial, or hidden, followed for every player; every league starts on full
//     names), whether the admin has confirmed the parents' agreement to children's
//     full names (R-14, R-29: a setting of its own, no to start; giving it asks the
//     admin to tick the confirmation, record 065), and whether an adult may ask to
//     appear as initials (R-15: off to start; R-25: a child always may). The people
//     module reads all three (readNamePolicy, T-81).
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
 * Whether a scorekeeper at the table may change a game's format before its first play
 * (P7 §5.1, S-35, decided for you: on to begin with, as Al-Hadi's games are run). Off,
 * the scorekeeper asks an admin, who may always give a game its own format from the
 * games area. The games module reads it (game-format.ts, step 2.119).
 */
export const scorekeepersMayChangeFormat = defineSetting({
  key: 'games.scorekeepersMayChangeFormat',
  type: z.boolean(),
  default: true,
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.games.scorekeepersMayChangeFormat.label',
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
 * How every player's name shows on public pages (R-24, R-29, T-81): full names, first
 * name and last initial, or hidden (by jersey number only). Every league starts on full
 * names. Full names show a child (and, in a youth or mixed league, a person whose age is
 * not known) by first name and last initial unless the confirmation below is given too
 * (R-14), so the start is what every league showed before step 2.162: adults in full,
 * children by first name and last initial (record 065). A person's own recorded request
 * for less always wins (R-25, R-27).
 */
export const publicNamesChoices = ['fullName', 'firstNameLastInitial', 'hidden'] as const;

export const publicNames = defineSetting({
  key: 'privacy.publicNames',
  type: z.enum(publicNamesChoices),
  default: 'fullName',
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.privacy.publicNames.label',
  // R-26: from the most shown to the least; a move down the list works even while the
  // league is archived or suspended.
  protectiveOrder: ['fullName', 'firstNameLastInitial', 'hidden'],
});

/**
 * R-14, R-29: the admin's confirmation that the parents or guardians of the children in
 * the league agreed to their full names being shown. A setting of its own (record 065),
 * no to start, so that "full names" can be chosen without it and a second writer of the
 * names setting can never show a child in full. Children are in full only where names
 * are full names AND this is yes. Saying yes asks the admin to tick the confirmation
 * (`setting.privacy.childrenInFullConfirmed.confirm`), and the activity entry says so;
 * taking it back shows less, so it works even in an archived or suspended league (R-26).
 */
export const childrenInFullConfirmed = defineSetting({
  key: 'privacy.childrenInFullConfirmed',
  type: z.boolean(),
  default: false,
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.privacy.childrenInFullConfirmed.label',
  confirm: [true],
  protectiveOrder: [true, false],
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

/**
 * R-33: whether the scoring screens (the scorer's rosters, the score page, the box score
 * sheet) show players in full. Off to start: they show the name the public sees
 * (scoringNames, games module). On, everyone shows in full except a person whose own
 * request is "initials" or "removed", which always holds there (R-25). Only the league's
 * owner and admins change it, like every privacy setting; a stored value that cannot be
 * read counts as off (readScoringNameView).
 */
export const scorekeepersSeeFullNames = defineSetting({
  key: 'privacy.scorekeepersSeeFullNames',
  type: z.boolean(),
  default: false,
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.privacy.scorekeepersSeeFullNames.label',
  protectiveOrder: [true, false],
});

/**
 * The least number of games a player needs to be ranked among the leaders (P7 §6: a rule
 * the league sets). The lead answered the starting value for the founder at step 2.93
 * part 3: 3 games, and the league can change it; 0 sets no minimum. At most 1000, as core's
 * leaders read allows (readStatLeaders). A player below it stays in the full table.
 */
export const minimumGamesToRank = defineSetting({
  key: 'statistics.minimumGamesToRank',
  type: z.number().int().min(0).max(1000),
  default: 3,
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.statistics.minimumGamesToRank.label',
});

/**
 * The league's site notice (step 2.60, F-10, P9 §3): one short line of the admin's own
 * words shown at the top of every public page of the league, such as "Unofficial demo,
 * not run by …". Empty, the start, shows none. Plain text: the page draws it as text,
 * never as markup, like every other free text. At most 200 characters, so it stays a
 * line or two on a phone.
 */
export const siteNotice = defineSetting({
  key: 'site.notice',
  type: z.string().trim().max(200),
  default: '',
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.site.notice.label',
});

/**
 * Whether the league asks search engines not to index its public pages (U-10: any league
 * may). Off to start. A league that holds a child (youth, mixed, or an adult league with a
 * recorded child) is never indexed whatever this says (U-18, readSiteFacts). Switching it on shows less, so
 * it works even in an archived or suspended league (R-26).
 */
export const siteDoNotIndex = defineSetting({
  key: 'site.doNotIndex',
  type: z.boolean(),
  default: false,
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.site.doNotIndex.label',
  protectiveOrder: [false, true],
});

export const declaredSettings = settingRegistry([
  membersStartPage,
  whoMayScore,
  scorekeeperReopenMinutes,
  scorekeepersMayChangeFormat,
  startingStatsLevel,
  teamsMayChooseStatsLevel,
  minimumGamesToRank,
  publicNames,
  childrenInFullConfirmed,
  playersMayAskForInitials,
  scorekeepersSeeFullNames,
  siteNotice,
  siteDoNotIndex,
]);
