// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The public pages, ours and a league's: the frame, home, standings, statistics and teams.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enSite = {
  'common.goToStart': 'Go to the SR Leagues start page',
  'common.loading': 'Loading',
  'common.notFound': 'We could not find that page.',
  'common.notFoundTitle': 'Page not found',
  'display.away': 'Away',
  'display.cancelled': 'Cancelled',
  'display.filters': 'Choose what to show',
  'display.final': 'Final',
  'display.forfeit': 'Forfeit',
  'display.home': 'Home',
  'display.jersey': 'Number',
  'display.jerseyShort': '#',
  // The shared display pieces (step 2.41), handed to packages/ui as labels.
  'display.live': 'Live',
  'display.noValue': 'Nothing recorded',
  'display.note': 'Note',
  'display.notes': 'Notes',
  'display.player': 'Player',
  'display.postponed': 'Postponed',
  'display.round': 'Round',
  'display.scoreboard': 'Scoreboard',
  'display.season': 'Season',
  'display.seed': 'Seed',
  'display.show': 'Show',
  'display.sortBy': 'Sort by',
  'display.team': 'Team',
  'display.total': 'Total',
  'display.versus': 'vs',
  'display.viewBoxScore': 'View box score',
  'display.winner': 'Winner',
  'footer.label': 'Footer',
  // Only on the app's made-up world on a computer (step 2.152), never on a real league.
  'footer.madeUp': 'A made-up league on this computer. It starts over when the app restarts.',
  'footer.privacy': 'Privacy',
  'footer.terms': 'Terms',
  'front.about':
    'SR Leagues runs the websites of sports leagues: their schedules, scores, standings and statistics, kept by the people who run each league.',
  'front.signIn': 'Sign in',
  'front.title': 'SR Leagues',
  'home.call.action': 'Meet the teams',
  'home.call.text': 'Rosters, records and results for every team in the league.',
  'home.call.title': 'Every team has a story.',
  'home.fullSchedule': 'See the full schedule',
  'home.fullStandings': 'See the full standings',
  'home.hero.schedule': 'See the schedule',
  'home.hero.standings': 'View the standings',
  // The first starting design's home page (step 2.147, C-16): a hero with one sentence and
  // two ways on, a tiny label (a kicker) over each section's title, and one call to action
  // near the foot. Every phrase is written to read well for any league and any sport.
  'home.hero.text': 'Scores, standings and the schedule for every team, all season long.',
  // The season's leaders on the home page (step 2.147 part 2): the section's title, its
  // kicker and its way on, a tiny label on each card (the leader's place and what is
  // led), and what the number is.
  'home.leaders': 'Leading the way',
  'home.leaders.all': 'All player stats',
  'home.leaders.kicker': 'The players to watch',
  'home.leaders.label': '{place} / {stat}',
  'home.leaders.perGame': 'per game',
  // The look of the home page (step 2.85): a live game under its own heading, and the
  // season in four numbers.
  'home.liveNow': 'Live now',
  'home.noGames': 'No games have been scheduled for this season yet.',
  'home.noResults': 'No games have been played yet.',
  // The home and schedule pages (step 2.42).
  'home.noSeason': 'There is no season to show yet.',
  'home.number.played': 'Games played',
  'home.number.rounds': 'Rounds',
  // In place of "Games to play" once a season has none left.
  'home.number.scored': 'Points scored',
  'home.number.teams': 'Teams',
  'home.number.toPlay': 'Games to play',
  'home.numbers': 'The season in numbers',
  'home.recentResults': 'Recent results',
  // Over "Recent results": the list opens with decided games and may end with one whose
  // result is still awaited, so its label is true of both.
  'home.results.kicker': 'Latest games',
  'home.seeTeams': 'See the teams',
  'home.standings': 'The standings',
  'home.standings.kicker': 'The race for the top',
  'home.standingsEmpty': 'The standings appear here once games have been played.',
  'home.upcoming': 'The next matchups',
  'home.upcoming.kicker': 'On the schedule',
  'nav.home': 'Home',
  'nav.menu': 'Menu',
  'nav.my': 'My team',
  'nav.news': 'News',
  'nav.register': 'Register',
  'nav.schedule': 'Schedule',
  'nav.signIn': 'Sign in',
  'nav.standings': 'Standings',
  // A league's public site (P2 §4).
  'nav.stats': 'Stats',
  'nav.teams': 'Teams',
  'page.account': 'Your account',
  'page.contact': 'Contact us',
  'page.find': 'Find a league',
  'page.game': 'Game',
  'page.help': 'Help',
  // Our own pages (P2 §4).
  'page.home': 'Find your league, or start one',
  'page.inbox': 'Your notifications',
  'page.newsPost': 'News',
  'page.player': 'Player',
  'page.privacy': 'Privacy',
  'page.signIn': 'Sign in',
  'page.start': 'Start a league',
  'page.status': 'Service status',
  'page.team': 'Team',
  'page.terms': 'Terms',
  'shell.archivedNotice': 'This league is archived. Everything here is kept as it was.',
  'shell.backToLeague': 'Back to the league home',
  'shell.draftNotice': 'This league is not published. Only the people who run it can see it.',
  'shell.notBuilt': 'This page is not built yet.',
  // The web app's shell (step 1.17). Pages not built yet say so plainly.
  'shell.siteName': 'SR Leagues',
  'shell.skipToContent': 'Skip to the content',
  'shell.suspendedNotice':
    'This league has been taken down. Only the people who run it can see it, to export their data.',
  'site.poweredBy': 'Powered by SR Leagues',
  // Step 2.96: two pages of local work and tests only, never in staging or production.
  'standIn.keptEmails.code': 'Its code',
  'standIn.keptEmails.empty': 'No email has been kept yet.',
  'standIn.keptEmails.intro':
    'The emails the made-up data sent on this computer, newest first. None of them left it. Only emails to made-up addresses are kept here: those ending in .test, .example, .invalid or .localhost, or at example.com, example.net or example.org or a name under them.',
  'standIn.keptEmails.keptAt': 'Kept {when}',
  'standIn.keptEmails.title': 'Emails kept on this computer',
  'standIn.keptEmails.to': 'To {address}',
  'standIn.keptEmails.words': 'What it says',
  'standIn.madeUpPeople.be': 'Be {name}',
  'standIn.madeUpPeople.intro':
    'Sign this browser in as one of the made-up people. They exist only in the made-up data on this computer. Where a person has no password, they are sent a code and then choose one.',
  'standIn.madeUpPeople.noCode':
    'No new code came in time, so no code was tried. Press the button again, or read the newest code on the kept emails’ page and type it in.',
  'standIn.madeUpPeople.none': 'In no league yet',
  'standIn.madeUpPeople.open': 'Open {league} as {name}',
  'standIn.madeUpPeople.place': '{league}: {roles}',
  'standIn.madeUpPeople.title': 'Be a made-up person',
  'standIn.otherHost.body':
    'This copy of SR Leagues holds only made-up leagues. It answers only requests made on the computer it runs on, to that computer’s own address, and not requests passed on by another server.',
  'standIn.otherHost.title': 'Not here',
  'standings.adjust.loss_one': '{sign}{count} loss',
  'standings.adjust.loss_other': '{sign}{count} losses',
  'standings.adjust.point_one': '{sign}{count} point',
  'standings.adjust.point_other': '{sign}{count} points',
  'standings.adjust.tie_one': '{sign}{count} tie',
  'standings.adjust.tie_other': '{sign}{count} ties',
  'standings.adjust.win_one': '{sign}{count} win',
  'standings.adjust.win_other': '{sign}{count} wins',
  'standings.adjustment': 'Adjusted by {changes}. {reason}',
  'standings.adjustmentJoin': ', ',
  'standings.allTeams': 'All teams',
  'standings.col.losses': 'L',
  'standings.col.played': 'GP',
  'standings.col.pointDifference': 'DIFF',
  'standings.col.points': 'PTS',
  'standings.col.pointsAgainst': 'PA',
  'standings.col.pointsFor': 'PF',
  'standings.col.streak': 'STRK',
  'standings.col.ties': 'T',
  'standings.col.winPercentage': 'PCT',
  'standings.col.wins': 'W',
  'standings.empty': 'The standings appear here once games have been played.',
  'standings.heading': 'The standings.',
  'standings.lead': 'Where every team stands after each game.',
  // The one note under the table for each group of teams level with each other (step
  // 2.195), marked beside each of them, so every word of it is true of each. Two teams: what
  // they are level on, then what put the first ahead, with its numbers. Three or more: what
  // they are level on and the season's tiebreakers, never which one placed which team.
  'standings.level.by.coin-flip': 'A coin flip puts {team} ahead.',
  'standings.level.by.fewest-points-allowed':
    'Fewer points allowed puts {team} ahead: {ahead} against {behind}.',
  'standings.level.by.head-to-head_one': 'The game between them puts {team} ahead.',
  'standings.level.by.head-to-head_other': 'The games between them put {team} ahead.',
  'standings.level.by.point-difference':
    'Point difference puts {team} ahead: {ahead} against {behind}.',
  'standings.level.by.points-scored': 'Points scored puts {team} ahead: {ahead} against {behind}.',
  // Beside a team level with others only because it has no games yet (0 counts as 0).
  'standings.level.notPlayed': '{teams} have not played yet.',
  'standings.level.points': '{teams} are level on points ({value}).',
  'standings.level.sentenceJoin': ' ',
  'standings.level.stillLevel':
    '{teams} are still level after all of them, so they are shown in a fixed order.',
  'standings.level.tiebreakerJoin': ', then ',
  'standings.level.tiebreakers': 'The season’s tiebreakers set their order: {tiebreakers}.',
  'standings.level.tiebreakersPartly':
    'The season’s tiebreakers set their order as far as they can: {tiebreakers}.',
  'standings.level.winPercentage': '{teams} are level on win percentage ({value}).',
  'standings.noSeason': 'There is no season to show yet.',
  // Teams that nothing in the rules separates: true of each of them, however many.
  'standings.order.still-tied':
    'Level with another team: nothing in the rules separates them yet, so they are shown in a fixed order.',
  // What follows the tables on the standings page: the latest decided games, as scoreboards.
  'standings.results': 'Latest results',
  'standings.results.kicker': 'How they got here',
  'standings.streak.lost': 'L{length}',
  'standings.streak.tied': 'T{length}',
  'standings.streak.won': 'W{length}',
  // The season's tiebreakers by name, as a note lists them (P7 §1).
  'standings.tiebreaker.coin-flip': 'a coin flip',
  'standings.tiebreaker.fewest-points-allowed': 'fewest points allowed',
  'standings.tiebreaker.head-to-head': 'head-to-head',
  'standings.tiebreaker.point-difference': 'point difference',
  'standings.tiebreaker.points-scored': 'points scored',
  // The standings and statistics pages (step 2.43).
  'standings.title': 'Standings',
  'stats.allPlayers': 'All players',
  // Said above both tables only where some statistic shown was kept in fewer games than
  // the GP beside it (P7 §5.2; the review of step 2.195).
  'stats.averagedOverOwnGames':
    'A statistic not recorded in every game is averaged over the games where it was.',
  'stats.by.average': 'Per game',
  'stats.by.total': 'Season totals',
  'stats.col.games': 'GP',
  'stats.col.gamesFull': 'Games played',
  'stats.col.player': 'Player',
  'stats.col.team': 'Team',
  // The teams' table: how many games a team's numbers come from (P7 §8; step 2.195).
  'stats.col.teamGamesFull': 'Games with statistics',
  'stats.col.value': 'Value',
  // Said with the tables: the statistics may count fewer games than the standings (P7 §8).
  'stats.countsGames':
    'Statistics count the games that were scored live or entered as a box score. A game with only a final score counts in the standings, not here.',
  'stats.empty': 'Statistics appear here once games have been played.',
  'stats.heading': 'By the numbers.',
  'stats.inAll': 'this season',
  'stats.lead': 'The season’s leaders, then every player and every team.',
  'stats.leaderDetail': '{team} · {games}',
  'stats.leaderGames_one': '{count} game',
  'stats.leaderGames_other': '{count} games',
  'stats.leaderName': '{rank}. {name}',
  // The number cards at the head of the statistics page's leaders: who leads a statistic,
  // and what the number is when the page shows season totals.
  'stats.leaderOf': '{stat} leader',
  'stats.leaders': 'Leaders',
  'stats.leadersNone': 'No leaders yet.',
  // Under "All players": the table lists everyone, the leaders above it only those with the
  // league's minimum games, so a player the table puts first may lead no card. The second
  // is said to screen readers after the games played of each such player.
  'stats.listedNotRanked_one': 'Every player is listed. Fewer than {count} game: not ranked yet.',
  'stats.listedNotRanked_other':
    'Every player is listed. Fewer than {count} games: not ranked yet.',
  'stats.minimumGames_one': 'A player needs at least {count} game to be ranked.',
  'stats.minimumGames_other': 'A player needs at least {count} games to be ranked.',
  'stats.noSeason': 'There is no season to show yet.',
  'stats.notRankedYet': 'not ranked yet',
  // Between two sentences of one note under a title.
  'stats.noteJoin': ' ',
  'stats.showBy': 'Show',
  'stats.teams': 'Teams',
  'stats.teamsJoin': ', ',
  'stats.teamsTotalsOnly': 'Only team totals are shown for {teams}.',
  'stats.title': 'Statistics',
  'stats.unnamedPlayer': 'A player (name not shown)',
  'team.allTeams': 'All teams',
  // A child the league shows by number only (R-24).
  'team.byNumber': '#{number}',
  'team.clearMine': 'Stop using this as my team',
  'team.isMine': 'This is your team on this device.',
  'team.jersey': 'Number',
  'team.leagueHome': 'League home',
  'team.makeMine': 'Make this my team',
  'team.mineNote': 'This device will open the league on this team.',
  // A member's own page of a league, `/{league}/my` (step 2.168).
  'team.my.none':
    'You are not on a team in this league this season. Once the league puts you on one, it opens here.',
  'team.my.seeTeams': 'See the teams',
  'team.my.several': 'Your teams.',
  'team.my.severalLead': 'You are on more than one team this season. Open the one you want.',
  'team.nameLeft': '{name} (left {date})',
  'team.nameNotShown': 'Name not shown',
  'team.noNumber': 'No number',
  'team.noResults': 'This team has not played a game yet.',
  'team.noSchedule': 'No games are coming up for this team.',
  'team.noSeed': 'Not seeded yet',
  'team.player': 'Player',
  'team.results': 'Results',
  'team.role': 'Role',
  'team.role.captain': 'Captain',
  'team.role.coach': 'Coach',
  'team.role.player': 'Player',
  'team.roster': 'Roster',
  'team.rosterEmpty': 'No one is on this team yet.',
  'team.rosterFormer': 'Left the team',
  'team.schedule': 'Schedule',
  'team.seedLine': 'Seed {seed}',
  'team.stats': 'Statistics',
  'team.statsNone': 'No statistics have been recorded for this team yet.',
  'team.statsPlayers': 'Players',
  'team.statsTotals': 'Team totals',
  'team.statsTotalsOnly': "Only this team's totals are shown. Its players' numbers are not public.",
  // Said to a signed-in member on their own team's page, once the page has asked (step 2.168).
  'team.yours': 'This is your team.',
  'team.yoursOpensHere': 'The league opens here for you.',
  'teams.call.text': 'Every game of the season, round by round.',
  // The band that closes the teams page, with the way to the schedule.
  'teams.call.title': 'See them play.',
  'teams.col.division': 'Division',
  'teams.col.record': 'Record',
  'teams.col.seed': 'Seed',
  'teams.col.team': 'Team',
  'teams.empty': 'No teams are in this season yet.',
  'teams.heading': 'The teams.',
  'teams.lead': 'Every team’s record, roster and games.',
  'teams.noDivision': 'No division',
  'teams.noSeason': 'There is no season to show yet.',
  'teams.noSeed': 'Not seeded yet',
  'teams.record': '{wins}-{losses}',
  'teams.recordTies': '{wins}-{losses}-{ties}',
  // The teams list and a team's page (step 2.44).
  'teams.title': 'Teams',
  // The mark on a person's own team, or the one this device chose (step 2.168).
  'teams.yours': 'Your team',
} as const;
