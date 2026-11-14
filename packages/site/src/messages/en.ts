// English interface text (T-187). Components ask for a key; they never hold the words.
// Add a key here first; every other language must then have it too.
export const en = {
  'site.poweredBy': 'Powered by SR Leagues',
  'nav.home': 'Home',
  'nav.schedule': 'Schedule',
  'nav.standings': 'Standings',
  'nav.teams': 'Teams',
  'nav.signIn': 'Sign in',
  'nav.menu': 'Menu',
  'footer.label': 'Footer',
  'footer.terms': 'Terms',
  'footer.privacy': 'Privacy',
  'common.loading': 'Loading',
  'common.notFound': 'We could not find that page.',
  'schedule.games_one': '{count} game on {date}',
  'schedule.games_other': '{count} games on {date}',
  // The web app's shell (step 1.17). Pages not built yet say so plainly.
  'shell.siteName': 'SR Leagues',
  'shell.notBuilt': 'This page is not built yet.',
  'shell.draftNotice': 'This league is not published. Only the people who run it can see it.',
  'shell.suspendedNotice':
    'This league has been taken down. Only the people who run it can see it, to export their data.',
  'shell.archivedNotice': 'This league is archived. Everything here is kept as it was.',
  // Our own pages (P2 §4).
  'page.home': 'Find your league, or start one',
  'page.find': 'Find a league',
  'page.start': 'Start a league',
  'page.signIn': 'Sign in',
  'page.account': 'Your account',
  'page.inbox': 'Your notifications',
  'page.help': 'Help',
  'page.contact': 'Contact us',
  'page.terms': 'Terms',
  'page.privacy': 'Privacy',
  'page.status': 'Service status',
  // A league's public site (P2 §4).
  'nav.stats': 'Stats',
  'nav.register': 'Register',
  'nav.my': 'My team',
  'nav.news': 'News',
  'page.team': 'Team',
  'page.player': 'Player',
  'page.game': 'Game',
  'page.newsPost': 'News',
  // The shared display pieces (step 2.41), handed to packages/ui as labels.
  'display.live': 'Live',
  'display.final': 'Final',
  'display.forfeit': 'Forfeit',
  'display.postponed': 'Postponed',
  'display.cancelled': 'Cancelled',
  'display.versus': 'vs',
  'display.winner': 'Winner',
  'display.viewBoxScore': 'View box score',
  'display.scoreboard': 'Scoreboard',
  'display.home': 'Home',
  'display.away': 'Away',
  'display.seed': 'Seed',
  'display.team': 'Team',
  'display.note': 'Note',
  'display.notes': 'Notes',
  'display.jersey': 'Number',
  'display.player': 'Player',
  'display.total': 'Total',
  'display.sortBy': 'Sort by',
  'display.round': 'Round',
  'display.season': 'Season',
  'display.show': 'Show',
  // The standings and statistics pages (step 2.43).
  'standings.title': 'Standings',
  'standings.allTeams': 'All teams',
  'standings.empty': 'The standings appear here once games have been played.',
  'standings.noSeason': 'There is no season to show yet.',
  'standings.col.played': 'GP',
  'standings.col.wins': 'W',
  'standings.col.losses': 'L',
  'standings.col.ties': 'T',
  'standings.col.winPercentage': 'PCT',
  'standings.col.points': 'PTS',
  'standings.col.pointsFor': 'PF',
  'standings.col.pointsAgainst': 'PA',
  'standings.col.pointDifference': 'DIFF',
  'standings.col.streak': 'STRK',
  'standings.streak.won': 'W{length}',
  'standings.streak.lost': 'L{length}',
  'standings.streak.tied': 'T{length}',
  'standings.adjustment': 'Adjusted by {changes}. {reason}',
  'standings.adjustmentJoin': ', ',
  'standings.adjust.win_one': '{sign}{count} win',
  'standings.adjust.win_other': '{sign}{count} wins',
  'standings.adjust.loss_one': '{sign}{count} loss',
  'standings.adjust.loss_other': '{sign}{count} losses',
  'standings.adjust.tie_one': '{sign}{count} tie',
  'standings.adjust.tie_other': '{sign}{count} ties',
  'standings.adjust.point_one': '{sign}{count} point',
  'standings.adjust.point_other': '{sign}{count} points',
  'standings.order.head-to-head':
    'Placed above the teams level with it by the games they played against each other.',
  'standings.order.point-difference':
    'Placed above the teams level with it by the difference between points scored and allowed.',
  'standings.order.points-scored': 'Placed above the teams level with it by points scored.',
  'standings.order.fewest-points-allowed':
    'Placed above the teams level with it by fewest points allowed.',
  'standings.order.coin-flip': 'Placed above the teams level with it by a coin flip.',
  'standings.order.still-tied':
    'Level with another team: nothing in the rules separates them yet, so they are shown in a fixed order.',
  'stats.title': 'Statistics',
  'stats.noSeason': 'There is no season to show yet.',
  'stats.empty': 'Statistics appear here once games have been played.',
  'stats.leaders': 'Leaders',
  'stats.leadersNone': 'No leaders yet.',
  'stats.minimumGames_one': 'A player needs at least {count} game to be ranked.',
  'stats.minimumGames_other': 'A player needs at least {count} games to be ranked.',
  'stats.showBy': 'Show',
  'stats.by.average': 'Per game',
  'stats.by.total': 'Season totals',
  'stats.leaderName': '{rank}. {name}',
  'stats.unnamedPlayer': 'A player (name not shown)',
  'stats.col.player': 'Player',
  'stats.col.team': 'Team',
  'stats.col.games': 'GP',
  'stats.col.gamesFull': 'Games played',
  'stats.col.value': 'Value',
  'stats.allPlayers': 'All players',
  'stats.teams': 'Teams',
  'stats.teamsTotalsOnly': 'Only team totals are shown for {teams}.',
  'stats.teamsJoin': ', ',
  // The home and schedule pages (step 2.42).
  'home.noSeason': 'There is no season to show yet.',
  'home.noGames': 'No games have been scheduled for this season yet.',
  'home.recentResults': 'Recent results',
  'home.noResults': 'No games have been played yet.',
  'home.upcoming': 'Upcoming games',
  'home.noUpcoming': 'There are no upcoming games scheduled.',
  'home.standings': 'Standings',
  'home.standingsEmpty': 'The standings appear here once games have been played.',
  'home.fullStandings': 'See the full standings',
  'home.fullSchedule': 'See the full schedule',
  'schedule.title': 'Schedule',
  'schedule.noSeason': 'There is no season to show yet.',
  'schedule.empty': 'No games have been scheduled for this season yet.',
  'schedule.noMatch': 'No games match that choice.',
  'schedule.allRounds': 'All rounds',
  'schedule.team': 'Team',
  'schedule.allTeams': 'All teams',
  'schedule.roundName': 'Round {number}',
  'schedule.gamesNoDate_one': '{count} game',
  'schedule.gamesNoDate_other': '{count} games',
  'schedule.phase.past': 'Finished',
  'schedule.phase.current': 'This round',
  'schedule.phase.upcoming': 'Coming up',
  'schedule.otherGames': 'Other games',
  'schedule.liveAnnouncement': '{away} {awayScore}, {home} {homeScore}: {status}',
  'schedule.gameNumber': 'Game {number}',
  'schedule.dateToBeSet': 'Date to be announced',
  'schedule.dateAndTimeToBeSet': '{date}, time to be announced',
  'schedule.whenWhere': '{when} at {where}',
  'schedule.venueCourt': '{venue}, {court}',
  'stat.points': 'Points',
  'stat.points.short': 'PTS',
  'stat.rebounds': 'Rebounds',
  'stat.rebounds.short': 'REB',
  'stat.assists': 'Assists',
  'stat.assists.short': 'AST',
  'stat.steals': 'Steals',
  'stat.steals.short': 'STL',
  'stat.blocks': 'Blocks',
  'stat.blocks.short': 'BLK',
  'stat.turnovers': 'Turnovers',
  'stat.turnovers.short': 'TO',
  'stat.fouls': 'Fouls',
  'stat.fouls.short': 'PF',
  // The admin (P4 §3).
  'admin.title': 'Admin',
  'admin.areasLabel': 'Admin areas',
  'admin.area.home': 'Home',
  'admin.area.registration': 'Registration',
  'admin.area.people': 'People',
  'admin.area.teams': 'Teams',
  'admin.area.schedule': 'Schedule',
  'admin.area.games': 'Games',
  'admin.area.standings': 'Standings and stats',
  'admin.area.site': 'Site',
  'admin.area.messages': 'Messages',
  'admin.area.season': 'Season settings',
  'admin.area.settings': 'League settings',
  'admin.emptyArea': 'Nothing here yet.',
  'admin.viewSite': 'View the site',
  // The admin's Teams screens (step 2.51, P4 §3, P7 §2).
  'adminTeams.noSeason': 'This league has no current season yet. Add one in Season settings first.',
  'adminTeams.seasonLine': 'Teams of {season}',
  'adminTeams.none': 'No teams yet.',
  'adminTeams.noDivision': 'No division',
  'adminTeams.ownColors': "The league's own colors",
  'adminTeams.openRoster': 'Roster',
  'adminTeams.allTeams': 'All teams',
  'adminTeams.create.title': 'Add a team',
  'adminTeams.create.submit': 'Add team',
  'adminTeams.field.name': 'Name',
  'adminTeams.field.shortName': "Short name, used in the team's address",
  'adminTeams.field.shortNameHint': 'Lower-case letters and numbers, with single hyphens.',
  'adminTeams.field.color': 'Color',
  'adminTeams.field.useOwnColors': "Use the league's own colors",
  'adminTeams.field.division': 'Division',
  'adminTeams.field.statsVisibility': "Who sees this team's players' numbers",
  'adminTeams.edit.title': 'Team details',
  'adminTeams.edit.submit': 'Save team details',
  'adminTeams.stats.title': "Who sees this team's numbers",
  'adminTeams.stats.submit': 'Save who sees the numbers',
  'adminTeams.stats.everyone': 'Everyone',
  'adminTeams.stats.staff': "Only the team's staff and the league's admins",
  'adminTeams.remove.title': 'Remove this team',
  'adminTeams.remove.body':
    'The team is moved to the bin. Its games and numbers are kept and it can be brought back.',
  'adminTeams.remove.submit': 'Move the team to the bin',
  'adminTeams.roster.title': 'Roster',
  'adminTeams.roster.none': 'Nobody is on this roster yet.',
  'adminTeams.roster.number': 'Number',
  'adminTeams.roster.noNumber': 'No number',
  'adminTeams.roster.name': 'Name',
  'adminTeams.roster.role': 'Role',
  'adminTeams.roster.role.player': 'Player',
  'adminTeams.roster.role.captain': 'Captain',
  'adminTeams.roster.role.coach': 'Coach',
  'adminTeams.roster.moveUp': 'Move up',
  'adminTeams.roster.moveDown': 'Move down',
  'adminTeams.roster.saveEntry': 'Save number and role',
  'adminTeams.roster.leftOn': 'Left on',
  'adminTeams.roster.markLeft': 'Mark as left',
  'adminTeams.roster.leftTitle': 'Left the team',
  'adminTeams.roster.leftLine': '{name}, left on {date}',
  'adminTeams.roster.readFailed':
    'The roster could not be read just now, so it is not shown. Reload the page to try again.',
  'adminTeams.add.readFailed':
    'The roster or the league list could not be read just now. Reload the page to try again.',
  'adminTeams.people.readFailed':
    'The league list could not be read just now, so it is not shown. Reload the page to try again.',
  // A person's name as the Teams screens show it; a language may put the parts the other way.
  'adminTeams.personName': '{firstName} {lastName}',
  // After a team's name in the list, with the space before it: " (North)".
  'adminTeams.inDivision': ' ({division})',
  'adminTeams.add.title': 'Add a player',
  'adminTeams.add.person': 'Person',
  'adminTeams.add.choose': 'Choose a person',
  'adminTeams.add.noOne': 'Everyone in the league list is already on this roster.',
  'adminTeams.add.number': 'Jersey number (0 to 99, or 00)',
  'adminTeams.add.role': 'Role',
  'adminTeams.add.submit': 'Add to the roster',
  'adminTeams.newPerson.title': 'Someone not in the list yet',
  'adminTeams.newPerson.firstName': 'First name',
  'adminTeams.newPerson.lastName': 'Last name',
  'adminTeams.newPerson.submit': 'Add the person and put them on the roster',
  'adminTeams.people.title': 'The league list',
  'adminTeams.people.body':
    'Taking someone off the list is refused while they are on a roster: mark them as having left first.',
  'adminTeams.people.remove': 'Remove from the league list',
  'adminTeams.confirm': 'Yes, I am sure',
  'adminTeams.done.created': 'The team was added.',
  'adminTeams.done.updated': 'The team was saved.',
  'adminTeams.done.statsSaved': 'Who sees the numbers was saved.',
  'adminTeams.done.removed': 'The team was moved to the bin.',
  'adminTeams.done.added': 'The player was added to the roster.',
  'adminTeams.done.entrySaved': 'The number and role were saved.',
  'adminTeams.done.moved': 'The roster order was saved.',
  'adminTeams.done.left': 'The player was marked as having left.',
  'adminTeams.done.personRemoved': 'The person was taken off the league list.',
  // Why a teams or people change was refused (T-187): `error.`, the command's name, the code.
  'error.invalid-input': 'Something you entered is not valid. Check the fields and try again.',
  'error.not-allowed': 'You are not allowed to do that.',
  'error.changed-since-read':
    'Someone else changed this while you were looking. The page now shows the latest; try again.',
  'error.not-confirmed': 'Tick the box to confirm first. Nothing was changed.',
  'error.teams.add_new_person.jersey-taken':
    'Another player on this team already wears that number, so the new person was not kept in the league list.',
  'error.teams.add_new_person.invalid-input':
    'The role or number is not valid, so nobody was added.',
  'error.teams.add_new_person.team-not-found': 'That team is not there, so nobody was added.',
  'error.teams.add_new_person.already-on-team':
    'That person is already on this team, so the new person was not kept in the league list.',
  'error.teams.add_new_person.not-allowed': 'You are not allowed to do that.',
  'error.teams.add_new_person.not-undone':
    'The person could not be put on the roster, and could not be taken off the league list again either, so they are still in the league list. Remove them there if they should not be.',
  'error.teams.list_roster.team-not-found': 'That team is not there.',
  'error.short-name-needed':
    'A short name could not be made from this name. Type a short name: lower-case letters and numbers, with single hyphens.',
  'error.unknown': 'That could not be done.',
  'error.teams.create_team.season-not-found': 'That season is not there.',
  'error.teams.create_team.division-not-found': 'That division is not there.',
  'error.teams.create_team.team-short-name-taken':
    'Another team of this season already has that short name.',
  'error.teams.create_team.team-name-taken': 'Another team of this season already has that name.',
  'error.teams.update_team.team-not-found': 'That team is not there.',
  'error.teams.update_team.division-not-found': 'That division is not there.',
  'error.teams.update_team.team-short-name-taken':
    'Another team of this season already has that short name.',
  'error.teams.update_team.team-name-taken': 'Another team of this season already has that name.',
  'error.teams.remove_team.team-not-found': 'That team is not there.',
  'error.teams.set_stats_visibility.team-not-found': 'That team is not there.',
  'error.teams.set_stats_visibility.teams-may-not-choose':
    'This league decides who sees the numbers; teams may not choose.',
  'error.teams.reorder_roster.team-not-found': 'That team is not there.',
  'error.teams.reorder_roster.roster-entry-not-found':
    'Someone on that list is not on this roster.',
  'error.teams.reorder_roster.roster-incomplete':
    'The roster changed while you were looking. The page now shows the latest; try again.',
  'error.teams.change_roster_entry.roster-entry-not-found': 'That roster entry is not there.',
  'error.teams.mark_left.roster-entry-not-found': 'That roster entry is not there.',
  'error.people.create_person.sensitive-fields-not-allowed':
    'You are not allowed to enter those details.',
  'error.people.remove_person.person-not-found': 'That person is not in the league list.',
  'error.people.remove_person.person-on-a-roster':
    'That person is still on a roster. Mark them as having left their team first, then take them off the list.',
  // The games area (step 2.55).
  'admin.games.intro': 'The games of today and the week ahead.',
  'admin.games.listProblem':
    'The games could not be shown. You may not have access to score or change games here.',
  'admin.games.empty': 'There are no games this week.',
  'admin.games.scorekeeper': 'Scorekeeper: {names}',
  'admin.games.noScorekeeper': 'No scorekeeper yet',
  'admin.games.scoreOf': 'Score for {team}',
  'admin.games.saveScore': 'Save final score',
  'admin.games.forfeitBy': 'Team that forfeits',
  'admin.games.recordForfeit': 'Record forfeit',
  'admin.games.postpone': 'Postpone',
  'admin.games.cancel': 'Cancel the game',
  'admin.games.otherActions': 'Forfeit, postpone or cancel',
  'admin.games.openTracker': 'Open the tracker',
  'admin.games.when': '{day}, {time}',
  'admin.games.noTime': 'No time set',
  'admin.games.notScorable': 'This league is archived or suspended, so games cannot be changed.',
  'admin.games.done.final': 'The final score is saved.',
  'admin.games.done.forfeit': 'The forfeit is recorded.',
  'admin.games.done.postpone': 'The game is postponed.',
  'admin.games.done.cancel': 'The game is cancelled.',
  'admin.games.error.not-allowed': 'You are not allowed to do that to this game.',
  'admin.games.error.invalid-input': 'Enter the score as two whole numbers from 0 to 999.',
  'admin.games.error.game-not-found': 'That game is not there.',
  'admin.games.error.changed-since-read':
    'Someone changed this game since you opened the page. It is shown again as it is now.',
  'admin.games.error.game-already-decided':
    'That game already has a final result. It can only be changed by reopening it.',
  'admin.games.error.game-cancelled': 'That game was cancelled, so it cannot be scored.',
  'admin.games.error.tie-not-allowed': 'This season does not allow ties. Enter a winner.',
  'admin.games.error.team-not-in-game': 'That team is not in this game.',
  'admin.games.error.game-not-postponable': 'Only a game that has not started can be postponed.',
  'admin.games.error.game-not-cancellable': 'Only a game that has not started can be cancelled.',
  'admin.games.error.unknown': 'That did not work. Nothing was changed.',
  // The box score grid (step 2.64).
  'admin.games.boxScore': 'Box score',
  'admin.boxScore.title': 'Box score: {away} at {home}',
  'admin.boxScore.help':
    'Copy the paper score sheet. Tick each player who played; a player with any number filled in counts as played. Leave a whole column empty if the sheet did not keep that number; it then does not count in that player’s averages. In a column you fill in, an empty box counts as 0.',
  'admin.boxScore.scoreHelp':
    'Leave a team’s score empty to use the total of its players’ points. A score you type is saved as you typed it, even if the players’ points add up to something else.',
  'admin.boxScore.scoreMismatch':
    'Check {team}: the score you typed is {score}, but its players’ points add up to {points}. It will be saved as {score} unless you change it.',
  'admin.boxScore.back': 'Back to the games',
  'admin.boxScore.player': 'Player',
  'admin.boxScore.jersey': '#{number}',
  'admin.boxScore.left': '(left the team)',
  'admin.boxScore.played': 'Played',
  'admin.boxScore.playedBy': '{name} played',
  'admin.boxScore.cellLabel': '{stat} for {name}',
  'admin.boxScore.minutes': 'Minutes',
  'admin.boxScore.minutes.short': 'MIN',
  'admin.boxScore.noPlayers': 'This team has no players on its roster yet. Add them in Teams.',
  'admin.boxScore.save': 'Save box score and make it final',
  'admin.boxScore.locked.decided':
    'This game is final. To correct it, reopen it with a reason; then fix the grid and save again.',
  'admin.boxScore.locked.cancelled': 'This game was cancelled, so it has no box score.',
  'admin.boxScore.locked.tracked':
    'This game was scored with the live tracker. Correct it in the tracker, so its list of plays still explains the numbers.',
  'admin.boxScore.reopenReason': 'Why it needs correcting (kept in the log, never shown publicly)',
  'admin.boxScore.reopen': 'Reopen to correct',
  'admin.boxScore.notFound': 'That game is not there, or you may not score it.',
  'admin.boxScore.done.save': 'The box score is saved and the game is final.',
  'admin.boxScore.done.reopen': 'The game is reopened. Fix the grid and save it again.',
  'admin.boxScore.error.invalid-input':
    'Enter every number as a whole number from 0 to 999 (minutes up to 1440), and both scores (or the players’ points).',
  'admin.boxScore.error.game-is-tracked':
    'This game was scored with the live tracker, so it is corrected there.',
  'admin.boxScore.error.player-not-on-team':
    'A player in the grid is no longer on that team’s roster. The page now shows the latest.',
  'admin.boxScore.error.player-listed-twice': 'A player is listed twice.',
  'admin.boxScore.error.did-not-play-has-stats':
    'A player marked as not playing has numbers. Tick “Played” or clear the numbers.',
  'admin.boxScore.error.game-not-decided': 'That game is not final, so there is nothing to reopen.',
  'stat.fg3': '3-pointers made',
  'stat.fg3.short': '3PM',
  'stat.fg1': 'Free throws made',
  'stat.fg1.short': 'FTM',
  // U-6: an address you are not allowed to open.
  'access.noAccess.title': 'You do not have access',
  'access.noAccess.body':
    'This page is for the people who run this league. If you should have access, ask the league to invite you.',
  // The courtside tracker (P2 §4), rebuilt here in a later step.
  'tracker.title': 'Score a game',
  // The fixed roles (A-3, P4 §4), by the name the access module gives each.
  'role.owner': 'Owner',
  'role.admin': 'Admin',
  'role.registrar': 'Registrar',
  'role.scheduler': 'Scheduler',
  'role.editor': 'Editor',
  'role.scorekeeper': 'Scorekeeper',
  'role.club_admin': 'Club admin',
  'role.coach': 'Coach',
  'role.captain': 'Captain',
  // Why a season's roster settings were refused (T-187): `error.`, the command's name,
  // the code, and the setting at fault when there is one.
  'error.leagues.set_season_roster_settings.invalid-rules': 'These roster settings are not valid.',
  'error.leagues.set_season_roster_settings.invalid-rules.minSize':
    'The smallest roster is not a valid number.',
  'error.leagues.set_season_roster_settings.invalid-rules.maxSize':
    'The largest roster is not a valid number, or is smaller than the smallest.',
  'error.leagues.set_season_roster_settings.invalid-rules.locksOn':
    'The day rosters lock is not a valid date.',
  // Why a roster change was refused (T-187).
  'error.teams.add_to_roster.team-not-found': 'That team is not there.',
  'error.teams.add_to_roster.person-not-found': 'That person is not in the league list.',
  'error.teams.add_to_roster.already-on-team': 'That person is already on this team.',
  'error.teams.add_to_roster.jersey-taken':
    'Another player on this team already wears that number. This season asks for a different number for each player.',
  'error.teams.change_roster_entry.jersey-taken':
    'Another player on this team already wears that number. This season asks for a different number for each player.',
  'error.teams.change_roster_entry.already-left':
    'This person has left the team, so their entry can no longer be changed.',
  'error.teams.mark_left.already-left': 'This person is already marked as having left.',
  'error.teams.mark_left.left-before-joined': 'The leaving date is before the day they joined.',
  // Why assigning a scorekeeper was refused (T-187).
  'error.games.assign_scorekeeper.game-not-found': 'That game is not there.',
  'error.games.assign_scorekeeper.game-closed':
    'That game is already decided or cancelled, so there is nothing left to score.',
  'error.games.assign_scorekeeper.cannot-score-game':
    'That person cannot score this game. Give them the scorekeeper role first.',
  'error.games.assign_scorekeeper.already-assigned':
    'That person is already assigned to this game.',
  'error.games.unassign_scorekeeper.game-not-found': 'That game is not there.',
  'error.games.unassign_scorekeeper.not-assigned': 'That person is not assigned to this game.',
  // Why opening a game to score was refused (T6 §5, T-187).
  'error.games.open_scoring_session.game-not-found': 'That game is not there.',
  'error.games.open_scoring_session.game-closed':
    'That game is already decided or cancelled. Reopen it first to correct it.',
  'error.games.take_over_scoring.game-not-found': 'That game is not there.',
  'error.games.take_over_scoring.game-closed':
    'That game is already decided or cancelled. Reopen it first to correct it.',
  'error.games.renew_scoring_session.game-not-found': 'That game is not there.',
  'error.games.renew_scoring_session.game-closed':
    'That game is now decided or cancelled, so scoring it has stopped.',
  'error.games.release_scoring_session.game-not-found': 'That game is not there.',
  // Why a schedule draft edit was refused (T-187).
  'error.scheduling.add_draft_game.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.add_draft_game.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.move_draft_game.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.move_draft_game.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.swap_draft_games.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.swap_draft_games.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.remove_draft_game.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.remove_draft_game.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.rename_draft_round.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.rename_draft_round.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.change_draft_round_date.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.change_draft_round_date.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.set_draft_recording.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.set_draft_recording.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.discard_schedule_draft.changed-since-read':
    'Someone else changed the schedule draft since you opened it, so it was not discarded. Reload it to see their changes.',
  'error.scheduling.add_draft_game.season-not-found': 'That season is not there.',
  'error.scheduling.add_draft_game.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.add_draft_game.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.add_draft_game.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.move_draft_game.season-not-found': 'That season is not there.',
  'error.scheduling.move_draft_game.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.move_draft_game.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.move_draft_game.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.swap_draft_games.season-not-found': 'That season is not there.',
  'error.scheduling.swap_draft_games.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.swap_draft_games.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.swap_draft_games.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.remove_draft_game.season-not-found': 'That season is not there.',
  'error.scheduling.remove_draft_game.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.remove_draft_game.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.remove_draft_game.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.rename_draft_round.season-not-found': 'That season is not there.',
  'error.scheduling.rename_draft_round.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.rename_draft_round.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.rename_draft_round.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.change_draft_round_date.season-not-found': 'That season is not there.',
  'error.scheduling.change_draft_round_date.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.change_draft_round_date.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.change_draft_round_date.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.set_draft_recording.season-not-found': 'That season is not there.',
  'error.scheduling.set_draft_recording.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.set_draft_recording.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.set_draft_recording.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.add_draft_game.unknown-team':
    'One of those teams is not a team of this season.',
  'error.scheduling.add_draft_game.unknown-venue': 'That venue is not there.',
  'error.scheduling.add_draft_game.unknown-court': 'That court is not at the chosen venue.',
  'error.scheduling.move_draft_game.unknown-venue': 'That venue is not there.',
  'error.scheduling.move_draft_game.unknown-court': 'That court is not at the chosen venue.',
  'error.scheduling.discard_schedule_draft.season-not-found': 'That season is not there.',
  'error.scheduling.discard_schedule_draft.draft-not-found':
    'There is no schedule draft to discard.',
  'error.scheduling.get_schedule_draft.season-not-found': 'That season is not there.',
  'error.scheduling.get_schedule_draft.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  // Why a fixtures import was refused (T-187).
  'error.imports.apply_fixture_import.season-not-found': 'That season is not there.',
  'error.imports.apply_fixture_import.revision-out-of-date':
    'The schedule was published since the import was previewed. Discard the draft or start the import again from the published schedule.',
  'error.imports.apply_fixture_import.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.imports.apply_fixture_import.draft-too-large':
    'These games do not fit in the schedule draft. Publish or discard the draft first, or split the file into smaller files.',
  'error.imports.apply_fixture_import.draft-changed':
    'The schedule draft changed while the games were being added. Try again.',
  'error.imports.apply_fixture_import.teams-changed':
    'A team named in the file has since been removed from this season. Upload the file again.',
  'error.imports.apply_fixture_import.venues-changed':
    'A venue or court named in the file has since been removed. Upload the file again.',
  'error.imports.apply_fixture_import.change-refused':
    'One of the games in the file cannot be added to the schedule as it stands.',
  'error.imports.apply_fixture_import.import-not-found': 'That import is not there.',
  'error.imports.apply_fixture_import.changed-since-read':
    'Someone else changed this import since you opened it. Reload it to see where it stands.',
  'error.imports.apply_fixture_import.not-ready':
    'This import is not ready to apply. It is either still being read, was refused, or has already been applied.',
  'error.imports.apply_fixture_import.report-unreadable':
    'The saved report of this import cannot be read. Upload the file again.',
  'error.imports.start_fixture_import.season-not-found': 'That season is not there.',
  'error.imports.start_fixture_import.file-too-large':
    'The file is too large to import in one go. Split it into smaller files.',
  'error.imports.start_fixture_import.no-account': 'You need to be signed in to import a file.',
  'error.imports.undo_fixture_import.import-not-found': 'That import is not there.',
  'error.imports.undo_fixture_import.changed-since-read':
    'Someone else changed this import since you opened it. Reload it to see where it stands.',
  'error.imports.undo_fixture_import.not-applied':
    'This import has not been applied, or has already been undone.',
  'error.imports.undo_fixture_import.record-unreadable':
    'The record of what this import added cannot be read, so it cannot be undone automatically.',
  'error.imports.undo_fixture_import.draft-changed':
    'The schedule draft was edited, published or discarded after this import, so it cannot be undone automatically. Remove its games by hand.',
  'error.imports.record_imported_scores.import-not-found': 'That import is not there.',
  'error.imports.record_imported_scores.not-applied':
    'Scores can be recorded only for an import that has been applied.',
  'error.imports.record_imported_scores.record-unreadable':
    'The record of what this import added cannot be read.',
  'error.imports.record_imported_scores.changed-since-read':
    'Someone else changed this import since you opened it. Reload it to see where it stands.',
  'error.imports.get_fixture_import.import-not-found': 'That import is not there.',
  // Why publishing the schedule, or previewing it, was refused (P7 §4.4, T-187).
  'error.scheduling.publish_schedule.season-not-found': 'That season is not there.',
  'error.scheduling.publish_schedule.draft-not-found': 'There is no schedule draft to publish.',
  'error.scheduling.publish_schedule.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.publish_schedule.changed-since-read':
    'Someone else changed or published the schedule draft since you opened it. Reload it to see the latest.',
  'error.scheduling.publish_schedule.revision-out-of-date':
    'The schedule was published since this draft was started. Discard the draft and start again from the published schedule.',
  'error.scheduling.publish_schedule.nothing-to-publish':
    'The draft changes nothing in the published schedule, so there is nothing to publish.',
  'error.scheduling.publish_schedule.change-no-longer-fits':
    'Some edits in the draft no longer fit the schedule (a game they name is gone). Fix or discard the draft.',
  'error.scheduling.publish_schedule.game-already-started':
    'The draft changes a game that is already live or has a final result. Games like that are corrected, not moved or removed.',
  'error.scheduling.publish_schedule.game-cannot-be-removed':
    'The draft removes a game that has been scored, which cannot be removed.',
  'error.scheduling.publish_schedule.game-id-taken':
    'A game the draft adds already exists (it may be in the bin or have no date).',
  'error.scheduling.publish_schedule.game-without-time':
    'A game in the draft has no time yet. Give every added or moved game a time before publishing.',
  'error.scheduling.publish_schedule.round-cannot-be-updated':
    'A round the draft renames or re-dates is no longer in this season. Discard the draft and start again.',
  'error.scheduling.publish_schedule.unknown-team':
    'A game in the draft names a team that is no longer in this season.',
  'error.scheduling.publish_schedule.unknown-venue':
    'A game in the draft names a venue that is no longer there.',
  'error.scheduling.publish_schedule.unknown-court':
    'A game in the draft names a court that is not at its venue.',
  'error.scheduling.preview_schedule_publish.season-not-found': 'That season is not there.',
  'error.scheduling.preview_schedule_publish.draft-not-found':
    'There is no schedule draft to publish.',
  'error.scheduling.preview_schedule_publish.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.imports.discard_fixture_import.import-not-found': 'That import is not there.',
  'error.imports.discard_fixture_import.not-reading':
    'This import is not waiting to be read, so there is nothing to discard.',
  // Activity log lines (A-6, T-226): the key is `activity.` and the command's name;
  // the values come from the entry's details. {role} is a role's name from above.
  'activity.access.invite': 'Invited someone as {role}',
  'activity.access.resend_invitation': 'Re-sent an invitation as {role}',
  'activity.access.cancel_invitation': 'Cancelled an invitation as {role}',
  'activity.access.accept_invitation': 'Joined as {role}',
  'activity.access.revoke_grant': "Removed someone's access as {role}",
  'activity.leagues.create': 'Created the league',
  'activity.leagues.set_name': "Changed the league's name",
  'activity.leagues.rename_short_name': "Changed the league's address to {slug}",
  'activity.leagues.set_status': "Changed the league's state to {status}",
  'activity.leagues.create_season': 'Added a season',
  'activity.leagues.set_current_season': 'Changed the current season',
  'activity.leagues.update_season': 'Changed a season',
  'activity.leagues.set_season_rules': "Changed a season's rules",
  'activity.leagues.set_season_roster_settings': "Changed a season's roster settings",
  'activity.leagues.create_division': 'Added a division',
  'activity.leagues.update_division': 'Changed a division',
  'activity.leagues.reorder_divisions': 'Changed the order of the divisions',
  'activity.leagues.remove_division': 'Moved a division to the bin',
  'activity.leagues.restore_division': 'Restored a division from the bin',
  'activity.games.record_final_score': 'Recorded a final score',
  'activity.games.record_forfeit': 'Recorded a forfeit',
  'activity.games.postpone_game': 'Postponed a game',
  'activity.games.cancel_game': 'Cancelled a game',
  'activity.games.reopen_game': 'Reopened a final game to correct it',
  'activity.standings.add_adjustment': 'Added a standings adjustment',
  'activity.standings.remove_adjustment': 'Removed a standings adjustment',
  'activity.games.assign_scorekeeper': 'Assigned a scorekeeper to a game',
  'activity.games.unassign_scorekeeper': 'Took a scorekeeper off a game',
  'activity.games.take_over_scoring': 'Took over scoring a game from another device',
  'activity.standings.rebuild_season': "Worked out a season's standings and totals again",
  'activity.people.create_person': 'Added a person',
  'activity.people.update_person': 'Changed a person',
  'activity.people.remove_person': 'Moved a person to the bin',
  'activity.teams.create_team': 'Added a team',
  'activity.teams.update_team': 'Changed a team',
  'activity.teams.remove_team': 'Moved a team to the bin',
  'activity.teams.set_stats_visibility': "Changed who sees a team's players' numbers",
  'activity.teams.add_to_roster': 'Added a person to a roster',
  'activity.teams.change_roster_entry': "Changed a player's number or role",
  'activity.teams.reorder_roster': 'Changed the order of a roster',
  'activity.teams.mark_left': 'Marked a person as having left a team',
  'activity.scheduling.add_draft_game': 'Added a game to the schedule draft',
  'activity.scheduling.move_draft_game': 'Moved a game in the schedule draft',
  'activity.scheduling.swap_draft_games': 'Swapped two games in the schedule draft',
  'activity.scheduling.remove_draft_game': 'Removed a game in the schedule draft',
  'activity.scheduling.rename_draft_round': 'Renamed a round in the schedule draft',
  'activity.scheduling.change_draft_round_date': "Changed a round's date in the schedule draft",
  'activity.scheduling.set_draft_recording': 'Changed how a game is recorded in the schedule draft',
  'activity.scheduling.discard_schedule_draft': 'Discarded the schedule draft',
  'activity.imports.start_fixture_import': 'Uploaded a fixtures file to import',
  'activity.imports.apply_fixture_import':
    'Added the games of a fixtures file to the schedule draft',
  'activity.imports.discard_fixture_import': 'Gave up on a fixtures file that was not read',
  'activity.imports.undo_fixture_import': 'Undid a fixtures import',
  'activity.imports.record_imported_scores': 'Recorded final scores from a fixtures import',
  'activity.scheduling.publish_schedule': 'Published the schedule',
  'activity.scheduling.create_venue': 'Added a venue',
  'activity.scheduling.update_venue': 'Changed a venue',
  'activity.scheduling.remove_venue': 'Moved a venue to the bin',
  'activity.scheduling.restore_venue': 'Restored a venue from the bin',
  'activity.scheduling.create_court': 'Added a court',
  'activity.scheduling.update_court': 'Changed a court',
  'activity.scheduling.remove_court': 'Moved a court to the bin',
  'activity.scheduling.restore_court': 'Restored a court from the bin',
  'activity.leagues.set_setting': 'Changed a setting',
  'activity.leagues.clear_setting': 'Went back to the default for a setting',
  // Setting labels (T5 §6, T-98): `setting.<key>.label`, shown on the admin screen.
  'setting.members.startPage.label':
    'Where members land first: the league home or their own team page',
  // The words for that setting's choices: `setting.<key>.option.<choice>`.
  'setting.members.startPage.option.leagueHome': 'The league home',
  'setting.members.startPage.option.myTeam': 'Their own team page',
  'setting.games.whoMayScore.label':
    'Which games a scorekeeper may score: any game, or only the games they are assigned to',
  'setting.games.whoMayScore.option.anyScorekeeper': 'Any game',
  'setting.games.whoMayScore.option.assignedOnly': 'Only games they are assigned to',
  'setting.teams.startingStatsLevel.label':
    "Who sees a new team's players' statistics until the team chooses",
  'setting.teams.startingStatsLevel.option.everyone': 'Everyone',
  'setting.teams.startingStatsLevel.option.staff': "Only the team's staff and the league's admins",
  'setting.teams.mayChooseStatsLevel.label':
    "Whether each team may choose who sees its players' statistics",
  // The invitation email (P4 §4, T-226), built by packages/emails. {league} is the
  // league's name, {role} a role's name from above, {days} how long a link works.
  'email.invitation.subject': 'You are invited to help run {league}',
  'email.invitation.intro': 'You have been invited to help run {league} as {role}.',
  'email.invitation.action': 'Accept the invitation',
  'email.invitation.howTo':
    'Open the link, then sign in or create your account, and you are in. The link works once.',
  'email.invitation.expiry':
    'It stops working {days} days after the invitation was sent, or as soon as it is re-sent or cancelled.',
  'email.invitation.notExpected':
    'If you were not expecting this, you can ignore this email and nothing will happen.',
  'email.invitation.linkFallback':
    'If the button does not work, copy this address into your browser:',
  // Sign-in emails (T-67, T-70, T-85), built by packages/emails. {code} is the 6-digit
  // code, {minutes} how long it works, {device} a device's name, {when} a time, {url}
  // an address of ours.
  'email.signInCode.subjectSignUp': 'Your code to create your account',
  'email.signInCode.subjectReset': 'Your code to choose a new password',
  'email.signInCode.code': 'Your code is {code}. It works for {minutes} minutes.',
  'email.signInCode.existing':
    'You already have an account with this address. Entering this code lets you choose a new password.',
  'email.signInCode.notExpected':
    'If you did not ask for this, you can ignore this email. Nobody can use the code without your mailbox.',
  'email.newDevice.subject': 'Your account was signed in on a new device',
  'email.newDevice.body': 'Your account was signed in on {device} at {when}.',
  'email.newDevice.notYou':
    'If this was not you, choose a new password and use "Sign out everywhere" on your account page:',
  'email.passwordChanged.subject': 'Your password was changed',
  'email.passwordChanged.body':
    'The password of your account was changed at {when}, and every other device was signed out.',
  'email.passwordChanged.notYou':
    'If this was not you, choose a new password with "Forgot your password?" on the sign-in page:',
  // The sign-in screens (step 1.14, P6 §2 and §5). The same words whether or not an
  // account exists (T-68).
  'signIn.email': 'Email',
  'signIn.password': 'Password',
  'signIn.submit': 'Sign in',
  'signIn.or': 'or',
  'signIn.google': 'Continue with Google',
  'signIn.forgot': 'Forgot your password?',
  'signIn.createAccount': 'New here? Create an account',
  'signIn.haveAccount': 'Already have an account? Sign in',
  'signUp.title': 'Create your account',
  'signUp.intro': 'Enter your email. We will send a 6-digit code to prove it is yours.',
  'signUp.sendCode': 'Email me a code',
  'forgot.title': 'Forgot your password',
  'forgot.intro':
    'Enter your email. If that address can sign in, we will send it a code to choose a new password.',
  'code.title': 'Enter your code',
  'code.sent':
    'If that address can sign in, we have sent it a code. It works for {minutes} minutes.',
  'code.label': 'Code',
  'code.submit': 'Continue',
  'code.again': 'Send a new code',
  'password.title': 'Choose your password',
  'password.rules': 'At least 8 characters. Passwords that have leaked are refused.',
  'password.submit': 'Save and sign in',
  'confirm.title': 'Enter your password again',
  'confirm.intro': 'This needs your password when you have not entered it in the last hour.',
  'confirm.submit': 'Continue',
  'confirm.google': 'Sign in with Google again',
  'account.devices': 'Signed-in devices',
  'account.thisDevice': 'This device',
  'account.signedInAt': 'Signed in {when}',
  'account.lastActive': 'Last active {when}',
  'account.signOut': 'Sign out',
  'account.signOutEverywhere': 'Sign out everywhere',
  'account.signOutEverywhereHelp': 'Signs out every device that uses your account, this one too.',
  'device.label': '{browser} on {system}',
  'device.unknown': 'A web browser',
  'problem.invalidEmail': 'That does not look like an email address.',
  'problem.tooManyAttempts_one': 'Too many tries. Please wait {count} second and try again.',
  'problem.tooManyAttempts_other': 'Too many tries. Please wait {count} seconds and try again.',
  'problem.codeUsedUp': 'Too many tries with this code. Ask for a new one.',
  'problem.codeNotSent': 'We could not send the email just now. Please try again in a minute.',
  'problem.codeWrong': 'That code is not right. Check the email and try again.',
  'problem.codeExpired': 'That code has run out. Ask for a new one.',
  'problem.proofInvalid': 'That took too long. Ask for a new code.',
  'problem.passwordTooShort': 'Your password needs at least 8 characters.',
  'problem.passwordTooLong': 'Your password is too long. Please choose a shorter one.',
  'problem.passwordLeaked':
    'That password appears in lists of leaked passwords. Please choose another.',
  'problem.wrongEmailOrPassword': 'Wrong email or password.',
  'problem.wrongPassword': 'Wrong password.',
  'problem.googleFailed': 'Signing in with Google did not work. Please try again.',
  'problem.signInAgain': 'Please sign in again.',
  'problem.signOutEverywhereFailed':
    'We could not sign out your other devices. This one is signed out: sign in and try again.',
  'problem.noPassword': 'Your account has no password. Sign in with Google again instead.',
  // The tracker's saved banner (T6 §4), chosen from the queue's status by
  // apps/web/src/features/tracker/queue-banner.ts.
  'tracker.queue.allSaved': 'All saved',
  'tracker.queue.waiting_one': '{count} action waiting to send',
  'tracker.queue.waiting_other': '{count} actions waiting to send',
  'tracker.queue.notSaved_one': '{count} action not saved',
  'tracker.queue.notSaved_other': '{count} actions not saved',
  'tracker.queue.storageFailed': 'This device could not save to its storage',
  'tracker.queue.separator': ' · ',
} as const;

export type MessageKey = keyof typeof en;
