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
  // What a screen reader is told in place of the pill's letters, "Final, OT" (step 2.200).
  // For translators: as display.finalOvertime below, "_one" has no {count}.
  'display.finalOvertimeSaid_one': 'Final after overtime',
  'display.finalOvertimeSaid_other': 'Final after {count} overtimes',
  // A final game's pill when it went to overtime (step 2.200, P7 §5.6): one overtime, or
  // {count} of them. A game ended in regulation says "Final" alone.
  // For translators: the form is picked by the language's plural rule, and "_one" has no
  // {count}. In a language whose "one" form also covers other numbers (21, 31...), that
  // count would be lost: write {count} into the "one" form there, or ask for an exact form
  // for 1.
  'display.finalOvertime_one': 'Final, OT',
  'display.finalOvertime_other': 'Final, {count}OT',
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
  // Only on the test copy (APP_ENV staging, step 2.205): in the footer of every league and
  // admin page, above the sign-in forms and on the account pages. Never on the scoring screen.
  'footer.testCopy':
    'A test copy. Every league and person here is made up: do not enter real people’s details.',
  'front.about':
    'SR Leagues runs the websites of sports leagues: their schedules, scores, standings and statistics, kept by the people who run each league.',
  'front.hero.first': 'Your league’s website,',
  'front.hero.second': 'kept by the people who run it.',
  'front.signIn': 'Sign in',
  'front.title': 'SR Leagues',
  'front.what.schedule': 'Schedule',
  'front.what.scheduleLine': 'Every game, with its day, time and place.',
  'front.what.scores': 'Scores',
  'front.what.scoresLine': 'Kept during the game, play by play.',
  'front.what.standings': 'Standings',
  'front.what.standingsLine': 'Worked out from every result.',
  'front.what.statistics': 'Statistics',
  'front.what.statisticsLine': 'Each player’s numbers, game by game.',
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
  // A shared place the home page has no room for: none of its players is drawn.
  'home.leaders.levelCut': '{count} players are level in place {place}.',
  // A shared first place: no one card leads.
  'home.leaders.levelFirst': '{count} players are level for first.',
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
  // Under the number of games still to play: "1" over "Game to play", "12" over "Games to
  // play". For translators: the number is drawn above the words, so neither form has {count}.
  'home.number.toPlay_one': 'Game to play',
  'home.number.toPlay_other': 'Games to play',
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
  // In place of "The next matchups" when every game the section lists is postponed (a season
  // whose other games are all played): they are waiting for a new date, not coming up.
  'home.upcoming.postponed': 'Waiting for a new date',
  // Under the home page's tables when a note there is shortened (step 2.198, fix round).
  'home.whyThisOrder': 'Why this order? See the full standings',
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
  // On an archived league's staff pages, for those who may bring it back (step 2.125).
  'shell.archivedNoticeUnarchive': 'Un-archive it in League settings',
  'shell.backToLeague': 'Back to the league home',
  'shell.draftNotice': 'This league is not published. Only the people who run it can see it.',
  // On a draft's staff pages, for those who may publish it (step 2.240).
  'shell.draftNoticePublish': 'Publish it in League settings',
  // The name screen readers give the league's own notice at the top of its public pages
  // (step 2.60); the notice's words are the admin's, from League settings.
  'shell.leagueNotice': 'Notice from the league',
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
  'standings.beingCorrected_one':
    '{count} game is being corrected and is not counted until it is finished again.',
  'standings.beingCorrected_other':
    '{count} games are being corrected and are not counted until they are finished again.',
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
  // Three or more, from the engine's own steps (step 2.198, S-74): each team's record in the
  // games among them, then what separated the teams still level, with the figures.
  'standings.leftTeam':
    'Left the league. Its results stay in the table, as they are part of other teams’ records.',
  'standings.level.ahead.coin-flip': 'A coin flip puts {team} ahead of {other}.',
  'standings.level.ahead.fewest-points-allowed':
    'Fewer points allowed puts {team} ahead of {other}: {ahead} against {behind}.',
  'standings.level.ahead.point-difference':
    'Point difference puts {team} ahead of {other}: {ahead} against {behind}.',
  'standings.level.ahead.points-scored':
    'Points scored puts {team} ahead of {other}: {ahead} against {behind}.',
  'standings.level.alsoLevel.fewest-points-allowed':
    '{teams} are also level on points allowed ({value}).',
  'standings.level.alsoLevel.point-difference':
    '{teams} are also level on point difference ({value}).',
  'standings.level.alsoLevel.points-scored': '{teams} are also level on points scored ({value}).',
  'standings.level.among': 'In the games among {teams}: {records}.',
  // Teams that started the tiebreakers again among themselves and are still level after
  // the games among just them (step 2.198, fix round).
  'standings.level.amongLevel': '{teams} are also level in the games among them: {records}.',
  // A points table: head-to-head compares points per game, so the note gives each team's
  // points and games in those games, which a parent can check with a pencil. When every team
  // played as many of those games, points alone give the order.
  'standings.level.amongPoints': 'In the games among {teams}, by points per game: {records}.',
  'standings.level.amongPointsEven': 'In the games among {teams} ({each}): {records}.',
  'standings.level.amongThese': 'In the games among these {count}: {records}.',
  'standings.level.amongThesePoints':
    'In the games among these {count}, by points per game: {records}.',
  'standings.level.amongThesePointsEven': 'In the games among these {count} ({each}): {records}.',
  'standings.level.between': 'In the games between {teams}: {records}.',
  'standings.level.betweenPoints': 'In the games between {teams}, by points per game: {records}.',
  'standings.level.betweenPointsEven': 'In the games between {teams} ({each}): {records}.',
  'standings.level.by.coin-flip': 'A coin flip puts {team} ahead.',
  'standings.level.by.fewest-points-allowed':
    'Fewer points allowed puts {team} ahead: {ahead} against {behind}.',
  'standings.level.by.head-to-head_one': 'The game between them puts {team} ahead.',
  'standings.level.by.head-to-head_other': 'The games between them put {team} ahead.',
  'standings.level.by.point-difference':
    'Point difference puts {team} ahead: {ahead} against {behind}.',
  'standings.level.by.points-scored': 'Points scored puts {team} ahead: {ahead} against {behind}.',
  // A team and its figure in a list: "Lions 1–0", "Tigers +3".
  'standings.level.entry': '{team} {figure}',
  'standings.level.gamesEach_one': '{games} game each',
  'standings.level.gamesEach_other': '{games} games each',
  'standings.level.metNoneOfThem':
    'Head-to-head does not count here: none of them has played another.',
  'standings.level.metNone_one':
    'Head-to-head does not count here: {teams} has played none of the others.',
  'standings.level.metNone_other':
    'Head-to-head does not count here: {teams} have played none of the others.',
  // Beside a team level with others only because it has no games yet (0 counts as 0).
  'standings.level.notPlayed': '{teams} have not played yet.',
  // "In the games among these four": a word up to ten, then the number.
  'standings.level.number.10': 'ten',
  'standings.level.number.3': 'three',
  'standings.level.number.4': 'four',
  'standings.level.number.5': 'five',
  'standings.level.number.6': 'six',
  'standings.level.number.7': 'seven',
  'standings.level.number.8': 'eight',
  'standings.level.number.9': 'nine',
  'standings.level.order.coin-flip': 'A coin flip puts them in this order: {values}.',
  'standings.level.order.fewest-points-allowed': 'By fewest points allowed: {values}.',
  'standings.level.order.point-difference': 'By point difference: {values}.',
  'standings.level.order.points-scored': 'By points scored: {values}.',
  'standings.level.points': '{teams} are level on points ({value}).',
  // The first team's figure says what the numbers are; the others give the numbers only.
  'standings.level.pointsFrom': '{points} from {games}',
  'standings.level.pointsFromGames_one': '{points} from {games} game',
  'standings.level.pointsFromGames_other': '{points} from {games} games',
  'standings.level.pointsWord_one': '{points} point',
  'standings.level.pointsWord_other': '{points} points',
  // A record in the games among level teams: wins–losses, and ties when any of them tied.
  // An invisible word joiner (U+2060) on each side of the dash keeps a record on one line
  // on a narrow phone ("0–" then "1" read wrongly at 320 wide).
  'standings.level.record': '{wins}⁠–⁠{losses}',
  'standings.level.recordTies': '{wins}⁠–⁠{losses}⁠–⁠{ties}',
  'standings.level.sentenceJoin': ' ',
  // Two teams that started again between themselves and split the games they played.
  'standings.level.split': '{teams} split their games with each other ({record}).',
  'standings.level.stillLevel':
    '{teams} are still level after all of them, so they are shown in a fixed order.',
  'standings.level.tiebreakerJoin': ', then ',
  'standings.level.tiebreakers': 'The season’s tiebreakers set their order: {tiebreakers}.',
  'standings.level.tiebreakersPartly':
    'The season’s tiebreakers set their order as far as they can: {tiebreakers}.',
  'standings.level.unbroken':
    'Nothing in the season’s tiebreakers separates {teams} yet, so they are shown in a fixed order.',
  'standings.level.winPercentage': '{teams} are level on win percentage ({value}).',
  'standings.noSeason': 'There is no season to show yet.',
  // Teams that nothing in the rules separates: true of each of them, however many.
  'standings.order.still-tied':
    'Level with another team: nothing in the rules separates them yet, so they are shown in a fixed order.',
  // What follows the tables on the standings page: the latest decided games, as scoreboards.
  // A team in the bin with results (A-17): its row stays, unlinked, with this note.
  'standings.removedTeam':
    'No longer in the league. Its results stay in the table, as they are part of other teams’ records.',
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
  // A leaders board's games: those its statistic was recorded in (S-63; step 2.199).
  'stats.col.leaderGamesFull': 'Games with this statistic recorded',
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
  // Under "Leaders": the minimum counts, for each statistic, the games it was recorded in,
  // the games each board's "N games" shows (S-63; step 2.199).
  'stats.minimumGames_one':
    'To be ranked in a statistic, a player needs it recorded in at least {count} game.',
  'stats.minimumGames_other':
    'To be ranked in a statistic, a player needs it recorded in at least {count} games.',
  'stats.noSeason': 'There is no season to show yet.',
  'stats.notRankedYet': 'not ranked yet',
  // Between two sentences of one note under a title.
  'stats.noteJoin': ' ',
  // Under the full table: a player who played the games has a statistic recorded in
  // fewer, so that column's top may be on no leaders board (S-63).
  'stats.recordedNotRanked_one':
    'A statistic recorded in fewer than {count} game is not ranked yet, so a column may be topped by a player on no leaders board.',
  'stats.recordedNotRanked_other':
    'A statistic recorded in fewer than {count} games is not ranked yet, so a column may be topped by a player on no leaders board.',
  'stats.showBy': 'Show',
  // Above the numbers a signed-in coach, captain or admin sees beyond the public's (step 2.46).
  'stats.staffNumbers.text':
    "The players' numbers of {teams} are shown only to the team's staff and the league's admins. Visitors see the team's totals only, so please keep these to yourself.",
  'stats.staffNumbers.title': 'Not public: shown to you as staff',
  // With the tables, when a team's total is not its players' numbers added up (step 2.196).
  'stats.teamTotalsCountTeam':
    "A team's totals count what was charged to the team and the final scores as entered, so they can differ from what its players' numbers add up to.",
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
  // S-87: a team that has left the league keeps its page, marked so.
  'team.left':
    'This team has left the league. Its results this season stay, as they are part of other teams’ records.',
  'team.makeMine': 'Make this my team',
  'team.mineNote': 'This device will open the league on this team.',
  // A member's own page of a league, `/{league}/my` (step 2.168).
  'team.my.none': 'You are not on a team in this league this season.',
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
  'team.yoursOpensHere': 'This is your team. The league opens here for you.',
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
  // S-87: the mark on the card of a team that has left the league.
  'teams.left': 'Left the league',
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
