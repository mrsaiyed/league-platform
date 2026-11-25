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
  'adminSettings.area.site': 'Public site',
  'adminSettings.area.statistics': 'Statistics',
  'adminSettings.area.teams': 'Team statistics',
  // A Profile form refused because the league changed meanwhile (step 2.155 part 3): the
  // screen keeps what was typed and shows "Saved now" beside it, and this says so.
  'adminSettings.changedMeanwhile':
    'Someone else changed the league since you opened this page, so it was not saved. What you typed is kept, and beside each box that differs is what is saved now. Save again to replace it with yours.',
  'adminSettings.clear': 'Go back to the default',
  // Beside a setting whose value asks to be confirmed (its `setting.<key>.confirm`).
  'adminSettings.confirmNote': 'Tick this only if you are choosing {choice}:',
  'adminSettings.default': 'Default: {value}',
  'adminSettings.defaultMark': '{choice} (the default)',
  'adminSettings.done.archived':
    'The league is archived. Everything in it is kept as it was, and nothing can be changed until it is brought back.',
  'adminSettings.done.published': 'The league is published. Visitors can see it now.',
  'adminSettings.done.unarchived': 'The league is published again. It can be changed as before.',
  'adminSettings.field.value': 'Value',
  // A refused Profile box (step 2.155 part 3): the box's label, then why.
  'adminSettings.fieldRefused': '{field}: {why}',
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
  'adminSettings.profile.audience.adult': 'Adults',
  'adminSettings.profile.audience.mixed': 'Both adults and under-18s',
  'adminSettings.profile.audience.youth': 'Under-18s',
  'adminSettings.profile.city': 'City',
  'adminSettings.profile.confirmTowardAdults':
    'I confirm that the people whose age we do not know may be shown as adults, with their full names (needed when choosing more adults than now).',
  'adminSettings.profile.contactEmail': 'Contact email',
  'adminSettings.profile.listed': 'List the league in the league finder',
  'adminSettings.profile.name': "The league's name",
  'adminSettings.profile.readOnly':
    'This league is archived or suspended, so its profile cannot be changed now.',
  'adminSettings.profile.save': 'Save',
  'adminSettings.profile.saveName': 'Save the name',
  'adminSettings.profile.saveShortName': 'Change the short name',
  'adminSettings.profile.saveWhoPlays': 'Save who plays',
  'adminSettings.profile.shortName': 'Short name (in the address)',
  'adminSettings.profile.shortNameForwards':
    'If you change it, the old address keeps forwarding to the new one for 12 months.',
  'adminSettings.profile.timeZone': 'Time zone (for example America/New_York)',
  'adminSettings.profile.timeZoneMovesGames':
    'If you change the time zone, the time shown for every game already entered changes with it.',
  'adminSettings.profile.title': 'Profile',
  'adminSettings.profile.whoPlays': 'Who plays',
  'adminSettings.profile.youthResets':
    'Choosing under-18s or both puts these privacy choices back to where a youth league starts, when you save:',
  'adminSettings.profile.youthResets.childrenInFull':
    'Children shown with their full names: back to no.',
  'adminSettings.profile.youthResets.listing': 'Listed in the league finder: off.',
  'adminSettings.profile.youthResets.namesChoice':
    'Names on public pages: your saved choice of full names is cleared, so you confirm it again under Privacy.',
  'adminSettings.profile.youthResetsAfter':
    'If the league is published it stays published, and League settings asks you to confirm its privacy choices. You can widen each one again in its own setting.',
  'adminSettings.publish.archive': 'Archive',
  'adminSettings.publish.archiveAsk':
    'Archive this league? Its pages stay up, but nothing in it can be changed until you bring it back.',
  'adminSettings.publish.archived':
    'This league is archived. Its pages stay up as they were, and nothing in it can be changed.',
  // The Publish part at the top of League settings (step 2.240, U-9, P3 §3): what a draft
  // means, the "Must fix" list with each item met or not, and the button that asks once.
  'adminSettings.publish.ask':
    'Publish this league? Anyone will then be able to see its public pages, and you cannot turn it back into a draft afterwards.',
  'adminSettings.publish.button': 'Publish',
  'adminSettings.publish.cancel': 'Not now',
  'adminSettings.publish.check.contactEmail': 'A contact email for the league',
  'adminSettings.publish.check.contactEmail.cure': 'Add it under Profile on this page.',
  'adminSettings.publish.check.privacyChosen':
    'Your privacy choice for young players: how names show on public pages',
  'adminSettings.publish.check.privacyChosen.cure':
    'Choose and save "Names on public pages" under Privacy, even to keep how it starts.',
  'adminSettings.publish.confirmPrivacyLive':
    'Under-18s play in this league, so its privacy choices must be confirmed. The league stays published meanwhile.',
  'adminSettings.publish.cureLink': 'Go to Privacy',
  'adminSettings.publish.cureLinkProfile': 'Go to Profile',
  'adminSettings.publish.draft':
    'This league is a draft. Only the people who run it can see it: anyone else who opens its pages is told they were not found.',
  'adminSettings.publish.live': 'This league is published. Anyone can see its public pages.',
  'adminSettings.publish.met': 'Done',
  'adminSettings.publish.mustFix': 'Must fix before publishing',
  'adminSettings.publish.notMet': 'Not done yet',
  'adminSettings.publish.notReady': 'Put the items above right first, then publish.',
  'adminSettings.publish.title': 'Publishing',
  'adminSettings.publish.unarchive': 'Un-archive',
  'adminSettings.save': 'Save',
  // Beside a saved Profile form (step 2.155 part 3), once: what was saved, named.
  'adminSettings.saved.audienceClearedFullNames':
    'Saved: who plays. The privacy choices listed are back where a youth league starts. Confirm them again under Privacy; you can widen each one in its own setting.',
  'adminSettings.saved.firstChild':
    'Saved: the contact email, city, time zone and listing. In the new time zone someone in this league is now a child, the first one recorded, so the confirmation that parents agreed to children’s full names is back to no and a saved choice of full names is cleared. Until you confirm again under Privacy, children are shown by first name and last initial.',
  'adminSettings.saved.name': "Saved: the league's name.",
  'adminSettings.saved.profile': 'Saved: the contact email, city, time zone and listing.',
  // Beside one setting after its save (step 2.155 part 4): the setting's short name.
  'adminSettings.saved.setting': 'Saved: {setting}.',
  'adminSettings.saved.settingCleared': '{setting} is back to its default.',
  'adminSettings.saved.shortName':
    'Saved: the short name. The old address forwards to the new one for 12 months.',
  'adminSettings.saved.whoPlays': 'Saved: who plays.',
  // Beside a box when someone else changed the league meanwhile (T-399).
  'adminSettings.savedNow': 'Saved now:',
  'adminSettings.savedNowNothing': '(nothing)',
  'adminSettings.savedNowTicked': 'ticked',
  'adminSettings.savedNowUnticked': 'not ticked',
  'adminSettings.usingDefault': 'Now: the default.',
  'adminSettings.usingOwn': 'Now: set for this league.',
  'adminSettings.yes': 'Yes',
  'seasonSettings.archive': 'Archive this season',
  'seasonSettings.archiveAsk':
    'Archive {season}? Visitors still find it under the season picker, but it becomes read-only: no results, teams, rosters, divisions or settings can be changed in it, and only a correction with a reason changes one of its games. An archived season cannot be un-archived.',
  'seasonSettings.archiveHidden':
    '{season} is hidden from visitors, so it cannot be archived: an archived season is shown to visitors and cannot be hidden again. Show it to visitors first if you want to archive it.',
  'seasonSettings.archiveNo': 'No, keep it open',
  'seasonSettings.archiveYes': 'Yes, archive it',
  'seasonSettings.archived':
    '{season} is archived. Visitors still find it under the season picker. It is read-only: only a correction with a reason changes one of its games, and it cannot be un-archived.',
  'seasonSettings.ask.after':
    "Nothing is saved until you say yes. The change is written in the league's activity log.",
  'seasonSettings.ask.moves_one': 'Saving these rules moves 1 team in the standings of {season}:',
  'seasonSettings.ask.moves_other':
    'Saving these rules moves {count} teams in the standings of {season}:',
  'seasonSettings.ask.no': 'No, change the rules',
  'seasonSettings.ask.yes': 'Yes, save and move them',
  'seasonSettings.cancel': 'Cancel',
  'seasonSettings.coinFlipKept':
    'Then a coin flip: teams still level after the others share a place until you record a flip in Standings and stats.',
  'seasonSettings.column.losses': 'Losses (L)',
  'seasonSettings.column.played': 'Games played (GP)',
  'seasonSettings.column.point-difference': 'Point difference (DIFF)',
  'seasonSettings.column.points': 'Points (PTS)',
  'seasonSettings.column.points-against': 'Points allowed (PA)',
  'seasonSettings.column.points-for': 'Points scored (PF)',
  'seasonSettings.column.streak': 'Streak (STRK)',
  'seasonSettings.column.ties': 'Ties (T)',
  'seasonSettings.column.win-percentage': 'Win percentage (PCT)',
  'seasonSettings.column.wins': 'Wins (W)',
  'seasonSettings.current': "{season} is the current season: the league's pages open on it.",
  'seasonSettings.currentAsk':
    "Make {season} the current season? The league's pages open on it from now on, instead of on the season that is current now. Nothing in either season is changed, and you can change it back.",
  'seasonSettings.currentAskHidden':
    'Make {season} the current season? Your own admin screens open on it from now on. It is hidden, so visitors go on seeing the newest season that is shown until you show this one. Nothing in either season is changed, and you can change it back.',
  'seasonSettings.currentHidden':
    '{season} is the current season: your admin screens open on it. It is hidden, so visitors see the newest season that is shown until you show this one.',
  'seasonSettings.currentNo': 'No, leave it',
  'seasonSettings.currentYes': 'Yes, make it current',
  'seasonSettings.divisions': 'Divisions',
  'seasonSettings.done.archived': '{season} is archived.',
  'seasonSettings.done.current': '{season} is the current season now.',
  'seasonSettings.done.hidden': '{season} is hidden from visitors again.',
  'seasonSettings.done.shown': 'Visitors can see {season} now.',
  'seasonSettings.done.shownLeagueHidden':
    '{season} is shown. Visitors will see it once the league is published.',
  'seasonSettings.done.started': '{season} is ready. Visitors cannot see it until you show it.',
  'seasonSettings.field.allowTies': 'Ties',
  'seasonSettings.field.bonusFouls': 'Bonus from team foul number',
  'seasonSettings.field.clockMode': 'Clock',
  'seasonSettings.field.columns': 'Columns the public table shows',
  'seasonSettings.field.columns.help':
    'In this order. The points column is only for a table ranked by points, and such a table always shows it.',
  'seasonSettings.field.datesHelp': 'Leave a day empty if it is not settled yet.',
  'seasonSettings.field.doubleBonusFouls': 'Double bonus from team foul number',
  'seasonSettings.field.doubleBonusFouls.help': 'Leave it empty for no double bonus.',
  'seasonSettings.field.endsOn': 'Last day',
  'seasonSettings.field.forfeitInDifference': 'Count forfeit scores in point difference',
  'seasonSettings.field.forfeitLoser': 'Score of the team that forfeited',
  'seasonSettings.field.forfeitWinner': 'Score of the team that did not forfeit',
  'seasonSettings.field.fullTimeouts': 'Full timeouts',
  'seasonSettings.field.lastMinutes': 'With a running clock: stop clock in the last minutes',
  'seasonSettings.field.lastMinutes.help': 'Minutes. Leave it empty for none.',
  'seasonSettings.field.mercyLead': 'With a stop clock: running clock once a team leads by',
  'seasonSettings.field.mercyLead.help': 'Points. Leave it empty for no mercy rule.',
  'seasonSettings.field.name': 'Season name',
  'seasonSettings.field.overtimeMinutes': 'Minutes of each overtime',
  'seasonSettings.field.overtimeTimeouts': 'Timeouts in each overtime',
  'seasonSettings.field.periodMinutes': 'Minutes in each half or quarter',
  'seasonSettings.field.periods': 'Game format',
  'seasonSettings.field.playerFoulLimit': 'Personal fouls that put a player out',
  'seasonSettings.field.playerFoulLimit.help': 'Leave it empty for no limit.',
  'seasonSettings.field.points.help': 'Used when the table ranks by points.',
  'seasonSettings.field.pointsPerLoss': 'Points for a loss',
  'seasonSettings.field.pointsPerTie': 'Points for a tie',
  'seasonSettings.field.pointsPerWin': 'Points for a win',
  'seasonSettings.field.rankBy': 'Rank teams by',
  'seasonSettings.field.recording': 'How games are recorded',
  'seasonSettings.field.recording.help':
    'Each game added to the schedule from now on starts this way, and Schedule can set a game otherwise. Games already on the schedule keep theirs.',
  'seasonSettings.field.shortTimeouts': 'Short timeouts',
  'seasonSettings.field.startsOn': 'First day',
  'seasonSettings.field.statistics': 'Statistics kept',
  'seasonSettings.field.statistics.help':
    'The box score sheet asks for these. Live tracking keeps at least points and fouls.',
  'seasonSettings.field.stopClockScope': 'Those last minutes are of',
  'seasonSettings.field.tiebreaker1': 'First tiebreaker',
  'seasonSettings.field.tiebreaker2': 'Second tiebreaker',
  'seasonSettings.field.tiebreaker3': 'Third tiebreaker',
  'seasonSettings.field.tiebreaker4': 'Fourth tiebreaker',
  'seasonSettings.field.tiebreakers': 'When teams are level',
  'seasonSettings.field.tiebreakers.help':
    'They are tried in this order. Head-to-head counts the games the level teams played against each other.',
  'seasonSettings.field.timeoutsCarry':
    'Unused timeouts carry over to the next half and to overtime',
  'seasonSettings.field.timeoutsPer': 'Timeouts are given',
  'seasonSettings.field.uniqueJerseys': 'Each player on a team wears a different number',
  'seasonSettings.field.uniqueJerseys.help':
    'A number already worn on the team is refused, with a sentence naming who wears it.',
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
  'seasonSettings.legend.forfeits': 'Forfeits',
  'seasonSettings.legend.fouls': 'Fouls',
  'seasonSettings.legend.timeouts': 'Timeouts',
  'seasonSettings.makeCurrent': 'Make this the current season',
  'seasonSettings.move.join': ', ',
  'seasonSettings.move.line': '{team}: {changes}.',
  'seasonSettings.move.lineDivision': '{team} ({division}): {changes}.',
  'seasonSettings.move.losses': 'losses {from} to {to}',
  'seasonSettings.move.pointDifference': 'point difference {from} to {to}',
  'seasonSettings.move.points': 'standings points {from} to {to}',
  'seasonSettings.move.pointsAgainst': 'points allowed {from} to {to}',
  'seasonSettings.move.pointsFor': 'points scored {from} to {to}',
  'seasonSettings.move.rank': 'place {from} to {to}',
  'seasonSettings.move.seed': 'seed {from} to {to}',
  'seasonSettings.move.ties': 'ties {from} to {to}',
  'seasonSettings.move.wins': 'wins {from} to {to}',
  'seasonSettings.noSeason': 'This league has no season yet.',
  'seasonSettings.noSeasonStart': 'This league has no current season yet. Start one below.',
  'seasonSettings.notCurrent': '{season} is not the current season.',
  'seasonSettings.notInUse': 'Not in use yet',
  'seasonSettings.notInUse.help': 'Nothing checks these yet, so they cannot be changed here.',
  'seasonSettings.notSavedYet':
    'This season uses the starting rules: none of its own are saved yet.',
  'seasonSettings.option.allowTies.no': 'Not allowed: a level game goes to overtime',
  'seasonSettings.option.allowTies.yes': 'Allowed',
  'seasonSettings.option.clockMode.running': 'Running clock: it keeps running through fouls',
  'seasonSettings.option.clockMode.stop': 'Stop clock: it stops by itself when a foul is recorded',
  'seasonSettings.option.periods.2': 'Two halves',
  'seasonSettings.option.periods.4': 'Four quarters',
  'seasonSettings.option.rankBy.points': 'Points for each win, tie and loss',
  'seasonSettings.option.rankBy.win-percentage': 'Win percentage',
  'seasonSettings.option.recording.box-score': 'Box score entered after the game',
  'seasonSettings.option.recording.final-score': 'Final score only',
  'seasonSettings.option.recording.live':
    'Live tracking: a scorekeeper records each play during the game',
  'seasonSettings.option.statistics.full':
    'All of those, with rebounds, assists, steals, blocks and turnovers',
  'seasonSettings.option.statistics.points-fouls': 'Points and fouls',
  'seasonSettings.option.statistics.points-only': 'Points only',
  'seasonSettings.option.statistics.standard': 'Points, 3-pointers, free throws, fouls and minutes',
  'seasonSettings.option.statistics.standard-turnovers':
    'Points, 3-pointers, free throws, fouls, minutes and turnovers',
  'seasonSettings.option.stopClockScope.game': 'The game',
  'seasonSettings.option.stopClockScope.half': 'Each half',
  'seasonSettings.option.stopClockScope.period': 'Each half or quarter',
  'seasonSettings.option.timeoutsPer.game': 'For the whole game',
  'seasonSettings.option.timeoutsPer.half': 'For each half',
  'seasonSettings.part.game.about':
    'How a game is played. The tracker follows these; games not started yet follow a change, and a game already played keeps the rules it was played under.',
  'seasonSettings.part.game.change': 'Change the game rules',
  'seasonSettings.part.game.save': 'Save the game rules',
  'seasonSettings.part.game.saved': 'Saved: the game rules. Games not started yet follow them.',
  'seasonSettings.part.game.title': 'Game rules',
  'seasonSettings.part.name.about': 'What the season is called, and when it runs.',
  'seasonSettings.part.name.change': 'Change the name and dates',
  'seasonSettings.part.name.save': 'Save the name and dates',
  'seasonSettings.part.name.saved': 'Saved: the name and dates.',
  'seasonSettings.part.name.title': 'Name and dates',
  'seasonSettings.part.recording.about': 'How results come in, and which numbers are kept.',
  'seasonSettings.part.recording.change': 'Change how games are recorded',
  'seasonSettings.part.recording.save': 'Save how games are recorded',
  'seasonSettings.part.recording.saved': 'Saved: how games are recorded and the statistics kept.',
  'seasonSettings.part.recording.title': 'Games and statistics',
  'seasonSettings.part.rosters.about': 'The rules for the players on each team.',
  'seasonSettings.part.rosters.change': 'Change the roster rules',
  'seasonSettings.part.rosters.save': 'Save the roster rules',
  'seasonSettings.part.rosters.saved': 'Saved: the roster rules.',
  'seasonSettings.part.rosters.title': 'Rosters',
  'seasonSettings.part.standings.about':
    'How the table ranks teams, what it shows, and what decides between level teams.',
  'seasonSettings.part.standings.change': 'Change the standings rules',
  'seasonSettings.part.standings.save': 'Save the standings rules',
  'seasonSettings.part.standings.saved':
    'Saved: the standings rules. The table has been worked out again from them.',
  'seasonSettings.part.standings.title': 'Standings',
  'seasonSettings.preset.high-school': 'High school',
  'seasonSettings.preset.high-school.about':
    'Four 8-minute quarters, stop clock, bonus from the 5th foul',
  'seasonSettings.preset.now': 'Saved now: the {preset} rules.',
  'seasonSettings.preset.own': "Saved now: the league's own game rules.",
  'seasonSettings.preset.rec-league': 'Rec league',
  'seasonSettings.preset.rec-league.about':
    'Two 20-minute halves, running clock, bonus from the 7th foul',
  'seasonSettings.preset.use': 'Use {preset}',
  'seasonSettings.presetFilled':
    'Filled in from the {preset} preset. Check the boxes: nothing is saved until you save.',
  'seasonSettings.presets': 'Start from a preset',
  'seasonSettings.presets.help':
    'A preset fills in the game rules below. Nothing is saved until you save.',
  'seasonSettings.readOnly':
    "This league cannot be changed now, so its seasons' settings are shown as they are.",
  'seasonSettings.readOnlyNotice':
    '{season} is archived. It can be read but not changed; a game in it is changed only by a correction with a reason.',
  'seasonSettings.refused.boxes': 'Not saved: the marked boxes need a change.',
  // A part refused because the season changed meanwhile (step 2.155 part 4): the boxes keep
  // what was typed and "Saved now" stands beside each that differs, and this says so.
  'seasonSettings.refused.changed-since-read':
    'Someone else saved this season since you opened this page, so this was not saved. What you typed is kept, and beside each box that differs is what is saved now. Save again to replace it with yours.',
  'seasonSettings.refused.not-allowed':
    "Only the league's owner or an admin can change Season settings.",
  'seasonSettings.refused.not-archivable': 'That season is archived already. Nothing was changed.',
  'seasonSettings.refused.not-hidden':
    'That season is not hidden any more, so nothing was changed. The page shows it as it is now.',
  'seasonSettings.refused.not-shown':
    'That season is over or already hidden, so nothing was changed. The page shows it as it is now.',
  'seasonSettings.refused.other': 'That could not be saved, and nothing was changed. Try again.',
  'seasonSettings.refused.season-not-found': 'That season is not there any more.',
  'seasonSettings.rulesUpgraded':
    "This season's rules were saved in an older form, and anything that could not be kept was left out. Check them, and save each part you change.",
  'seasonSettings.savedNow': 'Saved now:',
  'seasonSettings.savedNowNothing': '(nothing)',
  'seasonSettings.savedNowTicked': 'ticked',
  'seasonSettings.savedNowUnticked': 'not ticked',
  'seasonSettings.seasonName': 'Season: {name}',
  'seasonSettings.seasonNotFound': 'That season was not found, so this page shows {name}.',
  'seasonSettings.show': 'Show this season to visitors',
  'seasonSettings.showAsk':
    'Show {season} to visitors? Visitors will see its teams, schedule and results.',
  'seasonSettings.showAskLeagueHidden':
    'Show {season} to visitors? Once the league is published, they will see its teams, schedule and results.',
  'seasonSettings.showNo': 'No, keep it hidden',
  'seasonSettings.showYes': 'Yes, show it',
  'seasonSettings.start.about':
    'Copied from {season}: its game rules, the statistics kept and its divisions. Not copied: its games, results, standings and schedule.',
  'seasonSettings.start.aboutFresh':
    'This league has no current season, so nothing is copied: the new season starts from the usual game rules.',
  'seasonSettings.start.carry': 'Teams',
  'seasonSettings.start.carry.nothing': 'Start fresh, with no teams',
  'seasonSettings.start.carry.teams': 'Bring the teams, with empty rosters',
  'seasonSettings.start.carry.teams-and-rosters': 'Bring the teams and their rosters',
  'seasonSettings.start.carryHelp':
    'A team brought along is the same team across seasons. A team or player that left, or is in the bin, is not brought.',
  'seasonSettings.start.clock': 'When a foul is called, does the game clock stop?',
  'seasonSettings.start.clock.running': 'No, the clock keeps running (a running clock)',
  'seasonSettings.start.clock.stop': 'Yes, the clock stops on every foul (a stop clock)',
  'seasonSettings.start.endsOn': 'Last day (you can leave it empty)',
  'seasonSettings.start.gameRules': 'Game rules',
  'seasonSettings.start.gameRulesHelp':
    "Filled in with the rules the new season would start with. Leave them as they are to keep them; you can change them later in this season's settings.",
  'seasonSettings.start.hidden':
    'The new season starts hidden from visitors and is not the current season until you make it so.',
  'seasonSettings.start.mercyLead': 'Mercy rule: lead in points (leave empty for none)',
  'seasonSettings.start.mercyLeadHelp':
    'Only with a stop clock: once a team leads by this many points, the clock keeps running through fouls. Empty means no mercy rule.',
  'seasonSettings.start.name': 'Name',
  'seasonSettings.start.nameHelp': 'For example Winter 2027.',
  'seasonSettings.start.open': 'Start a new season',
  'seasonSettings.start.slug': 'Short name',
  'seasonSettings.start.slugHelp':
    "Used in the season's web address: lowercase letters, numbers and dashes, for example winter-2027.",
  'seasonSettings.start.startsOn': 'First day (you can leave it empty)',
  'seasonSettings.start.submit': 'Start the season',
  'seasonSettings.start.title': 'Start a new season',
  'seasonSettings.state.title': 'Current and archived',
  'seasonSettings.teamFouls.form':
    'Team fouls start again each half with halves, and each quarter with quarters, as the tracker counts them.',
  'seasonSettings.teamFouls.half': 'Team fouls start again each half, as the tracker counts them.',
  'seasonSettings.teamFouls.quarter':
    'Team fouls start again each quarter, as the tracker counts them.',
  'seasonSettings.term.clock': 'Clock',
  'seasonSettings.term.coinFlip': 'Coin flip',
  'seasonSettings.term.columns': 'Columns',
  'seasonSettings.term.dates': 'Dates',
  'seasonSettings.term.forfeits': 'Forfeits',
  'seasonSettings.term.format': 'Game format',
  'seasonSettings.term.fouls': 'Fouls',
  'seasonSettings.term.name': 'Name',
  'seasonSettings.term.preset': 'Preset',
  'seasonSettings.term.rankBy': 'Ranked by',
  'seasonSettings.term.recording': 'How games are recorded',
  'seasonSettings.term.rosterLimits': 'Smallest and largest roster',
  'seasonSettings.term.rosterLock': 'Rosters lock',
  'seasonSettings.term.statistics': 'Statistics kept',
  'seasonSettings.term.tiebreakers': 'When teams are level',
  'seasonSettings.term.ties': 'Ties',
  'seasonSettings.term.timeouts': 'Timeouts',
  'seasonSettings.term.uniqueJerseys': 'A different number for each player',
  'seasonSettings.tiebreaker.fewest-points-allowed': 'Fewest points allowed',
  'seasonSettings.tiebreaker.head-to-head': 'Head-to-head',
  'seasonSettings.tiebreaker.none': 'None',
  'seasonSettings.tiebreaker.point-difference': 'Point difference',
  'seasonSettings.tiebreaker.points-scored': 'Points scored',
  'seasonSettings.value.clock.running': 'Running clock',
  'seasonSettings.value.clock.runningLast':
    'Running clock, with a stop clock in the last {minutes} minutes of {scope}',
  'seasonSettings.value.clock.stop': 'Stop clock',
  'seasonSettings.value.clock.stopMercy':
    'Stop clock, then a running clock once a team leads by {lead}',
  'seasonSettings.value.dates': '{from} to {to}',
  'seasonSettings.value.datesFrom': 'From {from}',
  'seasonSettings.value.datesNone': 'Not set yet',
  'seasonSettings.value.datesTo': 'Until {to}',
  'seasonSettings.value.forfeits': 'Recorded {winner}–{loser}, {counted}',
  'seasonSettings.value.forfeits.counted': 'counted in point difference',
  'seasonSettings.value.forfeits.notCounted': 'not counted in point difference',
  'seasonSettings.value.format.2':
    'Two halves of {minutes} minutes; overtime of {overtime} minutes',
  'seasonSettings.value.format.4':
    'Four quarters of {minutes} minutes; overtime of {overtime} minutes',
  'seasonSettings.value.fouls': 'Bonus at {bonus} team fouls, {double}; {limit}',
  'seasonSettings.value.fouls.double': 'double bonus at {double}',
  'seasonSettings.value.fouls.limit': 'a player is out at {limit} fouls',
  'seasonSettings.value.fouls.noDouble': 'no double bonus',
  'seasonSettings.value.fouls.noLimit': 'no foul limit',
  'seasonSettings.value.no': 'No',
  'seasonSettings.value.noLimits': 'No limits',
  'seasonSettings.value.noLock': 'No lock',
  'seasonSettings.value.noTiebreakers': 'Nothing: they share a place',
  'seasonSettings.value.presetNone': "None: the league's own game rules",
  'seasonSettings.value.rankBy.points':
    'Points: {win} for a win, {tie} for a tie, {loss} for a loss',
  'seasonSettings.value.rosterLimits': '{min} to {max} players',
  'seasonSettings.value.rosterMax': 'At most {max} players',
  'seasonSettings.value.rosterMin': 'At least {min} players',
  'seasonSettings.value.timeouts':
    '{full} full and {short} short {per}; {overtime} in each overtime; {carry}',
  'seasonSettings.value.timeouts.carry': 'unused ones carry over',
  'seasonSettings.value.timeouts.noCarry': 'unused ones do not carry over',
  'seasonSettings.value.timeouts.per.game': 'for the game',
  'seasonSettings.value.timeouts.per.half': 'each half',
  'seasonSettings.value.yes': 'Yes',
  'seasonSettings.visibility.hidden': 'Only the people who run the league can see {season}.',
  'seasonSettings.visibility.leagueHidden':
    'Visitors cannot see this league until it is published, so they will see this season only after that.',
  'seasonSettings.visibility.over':
    '{season} is over. A season that is over stays shown, so its results stay on the site.',
  'seasonSettings.visibility.shown': 'Everyone can see {season}.',
  'seasonSettings.visibility.shownLeagueHidden':
    '{season} is shown, but visitors cannot see this league until it is published.',
  'seasonSettings.visibility.title': 'Who can see this season',
  'seasonSettings.wrong.choice': '{label}: choose one of the choices.',
  'seasonSettings.wrong.date': '{label}: a day, written year-month-day.',
  'seasonSettings.wrong.datesOrder': 'The last day cannot be before the first day.',
  'seasonSettings.wrong.doubleBonusAfterBonus': 'The double bonus must start after the bonus.',
  'seasonSettings.wrong.forfeitWinnerMore':
    'The team that did not forfeit must score more than the team that forfeited.',
  'seasonSettings.wrong.lastMinutesLong':
    "The stop clock's last minutes cannot be longer than a half or quarter.",
  'seasonSettings.wrong.liveNeedsFouls':
    'Live tracking records fouls as well: keep at least points and fouls, or record games another way.',
  'seasonSettings.wrong.minutes': '{label}: minutes from {min} to {max}.',
  'seasonSettings.wrong.minutesOrEmpty': '{label}: minutes from {min} to {max}, or empty for none.',
  'seasonSettings.wrong.name': 'Give the season a name, of up to 120 characters.',
  'seasonSettings.wrong.noColumns': 'Tick at least one column.',
  'seasonSettings.wrong.number': '{label}: a whole number from {min} to {max}.',
  'seasonSettings.wrong.numberOrEmpty':
    '{label}: a whole number from {min} to {max}, or empty for none.',
  'seasonSettings.wrong.pointsColumn':
    'A table ranked by points shows the points column: tick Points (PTS), or rank by win percentage.',
  'seasonSettings.wrong.pointsColumnUnranked':
    'Only a table ranked by points has a points column: untick Points (PTS), or rank by points.',
  'seasonSettings.wrong.pointsOrder':
    'A win must be worth at least a tie, and a tie at least a loss.',
  'seasonSettings.wrong.rules':
    'These rules cannot be saved as they are. Check each box and save again.',
  'seasonSettings.wrong.tiebreakerTwice':
    '{label}: each tiebreaker can be chosen once. Choose another, or None.',
  'seasonSettings.wrong.tiesColumn':
    'Ties are not allowed, so the table has no ties column: untick Ties (T), or allow ties.',
  'seasonSettings.wrong.uniqueJerseys':
    "A team of this season already has two players wearing one number. Change one of them on the team's page first, then switch this on.",
  'setting.games.scorekeeperReopenMinutes.label':
    'Minutes after a game ends during which the scorekeeper who ended it may reopen it from the tracker, with a reason, if they tapped End game too soon. 0 means never. After that, only an admin can reopen it.',
  // A setting's short name (step 2.155 part 4, T-419): a few words, no full stop, used in
  // "Saved: <name>.", "<name> is back to its default." and a refusal's "<name>: <why>".
  'setting.games.scorekeeperReopenMinutes.name': 'How long a scorekeeper may reopen a game',
  'setting.games.scorekeepersMayChangeFormat.label':
    "Scorekeepers may change a game's format before it starts. When this is off, they ask an admin, who can always give a game its own format from Games.",
  'setting.games.scorekeepersMayChangeFormat.name':
    "Whether scorekeepers may change a game's format",
  'setting.games.whoMayScore.label':
    'Which games a scorekeeper may score: any game, or only the games they are assigned to',
  'setting.games.whoMayScore.name': 'Which games a scorekeeper may score',
  'setting.games.whoMayScore.option.anyScorekeeper': 'Any game',
  'setting.games.whoMayScore.option.assignedOnly': 'Only games they are assigned to',
  // Setting labels (T5 §6, T-98): `setting.<key>.label`, shown on the admin screen.
  'setting.members.startPage.label':
    'Where members land first: the league home or their own team page',
  'setting.members.startPage.name': 'Where members land first',
  // The words for that setting's choices: `setting.<key>.option.<choice>`.
  'setting.members.startPage.option.leagueHome': 'The league home',
  'setting.members.startPage.option.myTeam': 'Their own team page',
  'setting.privacy.childrenInFullConfirmed.confirm':
    'I confirm that the parents or guardians of the children in this league have agreed to their full names being shown publicly, for example on the registration form.',
  // The parents' confirmation, a setting of its own (R-14, R-29, record 065).
  'setting.privacy.childrenInFullConfirmed.label':
    "Children's full names: shown only while names are on full names, and only with their parents' or guardians' agreement. In a youth or mixed league this also covers anyone whose age is not recorded.",
  'setting.privacy.childrenInFullConfirmed.name': "Children's full names",
  'setting.privacy.playersMayAskForInitials.label':
    'Adults may ask to appear as initials on public pages. Children always can, whatever this says: a request from a parent is always followed. Anyone can ask to have their name taken off. Switching this off only stops new requests: anyone already shown as initials stays that way until their own record is changed.',
  'setting.privacy.playersMayAskForInitials.name': 'Whether adults may ask for initials',
  'setting.privacy.publicNames.label':
    "Names on public pages: how players are shown on the team pages, game pages and statistics. If a person's own request for less is recorded (initials, or their name taken off), it always wins over this setting.",
  'setting.privacy.publicNames.name': 'Names on public pages',
  'setting.privacy.publicNames.option.firstNameLastInitial':
    'First name and last initial for everyone, adults and children, like "Jordan E."',
  // Each choice says what it does to adults and to children (R-29, record 065).
  'setting.privacy.publicNames.option.fullName':
    'Full names for adults, like "Jordan Ellis". Children are shown by first name and last initial, like "Jordan E.", unless their full names are confirmed below.',
  'setting.privacy.publicNames.option.hidden':
    'Hidden for everyone, adults and children: no names. A player appears by jersey number, like "#12", on team and game pages, and as "A player (name not shown)" in the statistics. People who know the team can still tell who a number is.',
  // The site's two settings (step 2.60, U-10, U-18).
  'setting.site.doNotIndex.label':
    'Ask search engines not to show this league. A league with children in it is never shown by search engines, whatever this says.',
  'setting.site.doNotIndex.name': 'Asking search engines not to show the league',
  'setting.site.notice.label':
    'A notice at the top of every public page, in your own words, for example "Unofficial demo". Leave it empty for none. At most 200 characters.',
  'setting.site.notice.name': 'The notice on public pages',
  'setting.statistics.minimumGamesToRank.label':
    'Games in which a statistic must be recorded for a player to be ranked on its leaders board. 0 sets no minimum. A player with fewer still shows in the full table.',
  'setting.statistics.minimumGamesToRank.name': 'Games needed to be ranked',
  'setting.teams.mayChooseStatsLevel.label':
    "Whether each team may choose who sees its players' statistics",
  'setting.teams.mayChooseStatsLevel.name': 'Whether teams may choose who sees their statistics',
  'setting.teams.startingStatsLevel.label':
    "Who sees a new team's players' statistics until the team chooses",
  'setting.teams.startingStatsLevel.name': "Who sees a new team's statistics",
  'setting.teams.startingStatsLevel.option.everyone': 'Everyone',
  'setting.teams.startingStatsLevel.option.staff': "Only the team's staff and the league's admins",
} as const;
