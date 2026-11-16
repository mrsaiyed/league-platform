// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The public schedule and its links.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enSchedule = {
  'schedule.allRounds': 'All rounds',
  'schedule.allTeams': 'All teams',
  // A game whose start has passed with no result yet: not still to come, and not decided.
  'schedule.awaitingResult': 'Awaiting result',
  'schedule.dateAndTimeToBeSet': '{date}, time to be announced',
  'schedule.dateToBeSet': 'Date to be announced',
  'schedule.empty': 'No games have been scheduled for this season yet.',
  'schedule.gameNumber': 'Game {number}',
  'schedule.gamesNoDate_one': '{count} game',
  'schedule.gamesNoDate_other': '{count} games',
  'schedule.games_one': '{count} game on {date}',
  'schedule.games_other': '{count} games on {date}',
  // The inner pages' heads (step 2.147 part 2, second landing): a phrased title and one
  // sentence under the season's name, so the inner pages and the home page are one
  // family. Each is written to read well for any league and any sport. The plain names
  // ("Schedule", "Standings") stay for the menu and the browser's tab.
  'schedule.heading': 'Every game, every round.',
  'schedule.lead': 'Scores as they come in, and everything still to be played.',
  'schedule.link.awaiting': '{away} against {home}, {when}, awaiting the result',
  'schedule.link.cancelled': 'cancelled',
  'schedule.link.final': 'final',
  'schedule.link.forfeit': 'forfeit',
  'schedule.link.live': 'live',
  'schedule.link.postponed': 'postponed',
  // What a game card's link says to a screen reader: every card leads to its game's page.
  'schedule.link.score': '{away} against {home}, {state}, {awayScore} to {homeScore}',
  'schedule.link.state': '{away} against {home}, {state}',
  'schedule.link.when': '{away} against {home}, {when}',
  'schedule.liveAnnouncement': '{away} {awayScore}, {home} {homeScore}: {status}',
  'schedule.noMatch': 'No games match that choice.',
  'schedule.noSeason': 'There is no season to show yet.',
  // On a game's card and its page, for a signed-in person who may score it (step 2.153;
  // S-38, S-50, S-70): the tracker for a game recorded live, Games for one recorded as a
  // final score or a box score. `which` is what a screen reader hears where several are
  // near: the button's words ({action}) and the game.
  'schedule.offer.enter': 'Enter the score',
  'schedule.offer.score': 'Score this game',
  'schedule.offer.which': '{action}: {away} against {home}',
  'schedule.otherGames': 'Other games',
  'schedule.phase.current': 'This round',
  'schedule.phase.past': 'Finished',
  'schedule.phase.upcoming': 'Coming up',
  // A finished round that still holds a game waiting for a new day says so beside its mark.
  'schedule.postponedCount_one': '{count} game postponed',
  'schedule.postponedCount_other': '{count} games postponed',
  // A postponed game has no day to come: its old day is never written bare.
  'schedule.postponedFrom': 'Postponed from {date}',
  // The same on a scoreboard card, whose pill already says "Postponed": the word is not
  // said twice, and the day still has "From" before it.
  'schedule.postponedFromDay': 'From {date}',
  'schedule.postponedNoDate': 'New date to be announced',
  'schedule.roundName': 'Round {number}',
  'schedule.showAll': 'Show every game',
  'schedule.team': 'Team',
  'schedule.title': 'Schedule',
  'schedule.venueCourt': '{venue}, {court}',
} as const;
