// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The admin's league and season settings, and the settings' own words.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enAdminSettings = {
  'adminSettings.area.games': 'Scoring',
  // A heading for each group of settings, by the first part of their keys.
  'adminSettings.area.members': 'Start page for members',
  'adminSettings.area.privacy': 'Privacy',
  'adminSettings.area.statistics': 'Statistics',
  'adminSettings.area.teams': 'Team statistics',
  'adminSettings.clear': 'Go back to the default',
  // Beside a setting whose value asks to be confirmed (its `setting.<key>.confirm`).
  'adminSettings.confirmNote': 'Tick this only if you are choosing {choice}:',
  'adminSettings.default': 'Default: {value}',
  'adminSettings.defaultMark': '{choice} (the default)',
  'adminSettings.done.cleared': 'The setting is back to its default.',
  'adminSettings.done.saved': 'The setting was saved.',
  'adminSettings.field.value': 'Value',
  'adminSettings.groups': 'Groups of settings',
  // The admin's League settings screen (step 2.48). The words for each setting itself are
  // `setting.<key>.label` and `setting.<key>.option.<choice>`, declared with the setting.
  'adminSettings.intro':
    'These settings apply to the whole league. Each shows what it is set to now, its default and what it accepts.',
  'adminSettings.limits.choice': 'Accepts one of the choices shown.',
  'adminSettings.limits.number': 'Accepts a number from {min} to {max}.',
  'adminSettings.limits.other': 'This setting cannot be changed on this screen.',
  'adminSettings.limits.text': 'Accepts up to {max} characters.',
  'adminSettings.limits.toggle': 'Accepts yes or no.',
  'adminSettings.limits.whole': 'Accepts a whole number from {min} to {max}.',
  'adminSettings.no': 'No',
  'adminSettings.none': 'This league has no settings to change yet.',
  'adminSettings.privacy.confirm.adultNoChildren':
    'A player recorded as a child is shown by first name and last initial.',
  'adminSettings.privacy.confirm.adultWithChildren':
    'This league has players recorded as children. Tick to show their full names too, while names are on full names.',
  'adminSettings.privacy.confirm.youthOrMixed':
    "Tick to show the young players' full names too, while names are on full names.",
  'adminSettings.privacy.confirmedOn': 'Confirmed on {date}.',
  // What the Privacy part says around its settings (step 2.162, R-29, record 065): one
  // opening sentence by who plays, what is in force now, and where the parents'
  // confirmation is offered.
  'adminSettings.privacy.intro.adult':
    'Your league is for adults, so it starts with full names. Choose less here at any time.',
  'adminSettings.privacy.intro.mixed':
    'Your league has both adults and young players. It starts with adults by full name and young players by first name and last initial. Choose less here at any time.',
  'adminSettings.privacy.intro.youth':
    'Your league is for young players. It starts with adults by full name and young players by first name and last initial. Choose less here at any time.',
  'adminSettings.privacy.keptNoEffect':
    "The parents' confirmation is kept, but it has no effect while names are not on full names.",
  'adminSettings.privacy.now.full':
    'Now: adults are shown by full name, and children by first name and last initial.',
  'adminSettings.privacy.now.fullConfirmed': 'Now: everyone is shown by full name, children too.',
  'adminSettings.privacy.now.hidden':
    'Now: nobody is shown by name; players appear by jersey number.',
  'adminSettings.privacy.now.initial': 'Now: everyone is shown by first name and last initial.',
  'adminSettings.privacy.unknownAge':
    'In this league, anyone whose record does not say whether they are a child or an adult is shown as a child, coaches too.',
  'adminSettings.save': 'Save',
  'adminSettings.usingDefault': 'Now: the default.',
  'adminSettings.usingOwn': 'Now: set for this league.',
  'adminSettings.yes': 'Yes',
  'seasonSettings.done.hidden': '{season} is hidden from visitors again.',
  'seasonSettings.done.shown': 'Visitors can see {season} now.',
  'seasonSettings.done.shownLeagueHidden':
    '{season} is shown. Visitors will see it once the league is published.',
  'seasonSettings.hide': 'Hide it again',
  'seasonSettings.hideAsk':
    'Hide {season} from visitors? Its teams, schedule, results and standings disappear from the public site, and its address shows "Page not found". Nothing is deleted, and you can show it again.',
  'seasonSettings.hideAskCurrent':
    "It is the league's current season, so the league's home page and its season picker will show another season visitors can see instead, or no season if there is none.",
  'seasonSettings.hideAskLive':
    'A game of {season} is being scored right now: its scorekeeper can keep saving it, but people following it will stop getting updates.',
  'seasonSettings.hideNo': 'No, keep it shown',
  'seasonSettings.hideYes': 'Yes, hide it',
  // Admin → Season settings (step 2.182, A-18): its first panel, who can see a season.
  // Step 2.47 builds the season's name, dates and rules around it.
  'seasonSettings.intro': 'Settle how a season runs, and when visitors can see it.',
  'seasonSettings.noSeason': 'This league has no season yet.',
  'seasonSettings.refused.not-hidden':
    'That season is not hidden any more, so nothing was changed. The page shows it as it is now.',
  'seasonSettings.refused.not-shown':
    'That season is over or already hidden, so nothing was changed. The page shows it as it is now.',
  'seasonSettings.seasonName': 'Season: {name}',
  'seasonSettings.seasonNotFound': 'That season was not found, so this page shows {name}.',
  'seasonSettings.show': 'Show this season to visitors',
  'seasonSettings.showAsk':
    'Show {season} to visitors? Visitors will see its teams, schedule and results.',
  'seasonSettings.showAskLeagueHidden':
    'Show {season} to visitors? Once the league is published, they will see its teams, schedule and results.',
  'seasonSettings.showNo': 'No, keep it hidden',
  'seasonSettings.showYes': 'Yes, show it',
  'seasonSettings.visibility.hidden': 'Only the people who run the league can see {season}.',
  'seasonSettings.visibility.leagueHidden':
    'Visitors cannot see this league until it is published, so they will see this season only after that.',
  'seasonSettings.visibility.over':
    '{season} is over. A season that is over stays shown, so its results stay on the site.',
  'seasonSettings.visibility.shown': 'Everyone can see {season}.',
  'seasonSettings.visibility.shownLeagueHidden':
    '{season} is shown, but visitors cannot see this league until it is published.',
  'seasonSettings.visibility.title': 'Who can see this season',
  'setting.games.scorekeeperReopenMinutes.label':
    'Minutes after a game ends during which the scorekeeper who ended it may reopen it from the tracker, with a reason, if they tapped End game too soon. 0 means never. After that, only an admin can reopen it.',
  'setting.games.whoMayScore.label':
    'Which games a scorekeeper may score: any game, or only the games they are assigned to',
  'setting.games.whoMayScore.option.anyScorekeeper': 'Any game',
  'setting.games.whoMayScore.option.assignedOnly': 'Only games they are assigned to',
  // Setting labels (T5 §6, T-98): `setting.<key>.label`, shown on the admin screen.
  'setting.members.startPage.label':
    'Where members land first: the league home or their own team page',
  // The words for that setting's choices: `setting.<key>.option.<choice>`.
  'setting.members.startPage.option.leagueHome': 'The league home',
  'setting.members.startPage.option.myTeam': 'Their own team page',
  'setting.privacy.childrenInFullConfirmed.confirm':
    'I confirm that the parents or guardians of the children in this league have agreed to their full names being shown publicly, for example on the registration form.',
  // The parents' confirmation, a setting of its own (R-14, R-29, record 065).
  'setting.privacy.childrenInFullConfirmed.label':
    "Children's full names: shown only while names are on full names, and only with their parents' or guardians' agreement. In a youth or mixed league this also covers anyone whose age is not recorded.",
  'setting.privacy.playersMayAskForInitials.label':
    'Adults may ask to appear as initials on public pages. Children always can, whatever this says: a request from a parent is always followed. Anyone can ask to have their name taken off. Switching this off only stops new requests: anyone already shown as initials stays that way until their own record is changed.',
  'setting.privacy.publicNames.label':
    "Names on public pages: how players are shown on the team pages, game pages and statistics. If a person's own request for less is recorded (initials, or their name taken off), it always wins over this setting.",
  'setting.privacy.publicNames.option.firstNameLastInitial':
    'First name and last initial for everyone, adults and children, like "Jordan E."',
  // Each choice says what it does to adults and to children (R-29, record 065).
  'setting.privacy.publicNames.option.fullName':
    'Full names for adults, like "Jordan Ellis". Children are shown by first name and last initial, like "Jordan E.", unless their full names are confirmed below.',
  'setting.privacy.publicNames.option.hidden':
    'Hidden for everyone, adults and children: no names. A player appears by jersey number, like "#12", on team and game pages, and as "A player (name not shown)" in the statistics. People who know the team can still tell who a number is.',
  'setting.statistics.minimumGamesToRank.label':
    'Games a player must have played to be ranked among the leaders. 0 ranks everyone. A player with fewer still shows in the full table.',
  'setting.teams.mayChooseStatsLevel.label':
    "Whether each team may choose who sees its players' statistics",
  'setting.teams.startingStatsLevel.label':
    "Who sees a new team's players' statistics until the team chooses",
  'setting.teams.startingStatsLevel.option.everyone': 'Everyone',
  'setting.teams.startingStatsLevel.option.staff': "Only the team's staff and the league's admins",
} as const;
