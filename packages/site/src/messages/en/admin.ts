// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The admin's frame and the areas not in a file of their own.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enAdmin = {
  'admin.area.games': 'Games',
  'admin.area.home': 'Home',
  'admin.area.messages': 'Messages',
  'admin.area.people': 'People',
  'admin.area.registration': 'Registration',
  'admin.area.schedule': 'Schedule',
  'admin.area.season': 'Season settings',
  'admin.area.settings': 'League settings',
  'admin.area.site': 'Site',
  'admin.area.standings': 'Standings and stats',
  'admin.area.teams': 'Teams',
  'admin.areasLabel': 'Admin areas',
  // The admin's own frame and its home (step 2.103).
  'admin.backToAdmin': 'Back to the admin',
  // League settings → Bin (step 2.77, A-5): what was removed, and the way back for each.
  'admin.bin.back': 'Bring it back',
  'admin.bin.backDone.game': 'Brought back. The game is on the schedule again.',
  'admin.bin.backDone.person': 'Brought back. They are on the league list again.',
  'admin.bin.backDone.team': 'Brought back. The team’s roster and games came back with it.',
  'admin.bin.backLink.game': 'Go to Schedule',
  'admin.bin.backLink.person': 'Open their record',
  'admin.bin.backLink.team': 'Open the team',
  'admin.bin.empty': 'Nothing is in the bin.',
  'admin.bin.game.name': '{home} against {away}',
  'admin.bin.game.noRound': 'It has no round now, so it comes back with no round.',
  'admin.bin.games.none': 'No removed games.',
  'admin.bin.games.title': 'Removed games',
  'admin.bin.keep':
    'A removed thing is kept for {days} days, then deleted for good. A game, and a team or person with games, stays here until it is brought back.',
  'admin.bin.link.games': 'Removed games',
  'admin.bin.link.teamsPeople': 'Removed teams and people',
  'admin.bin.movedToBin': 'Moved to the bin.',
  'admin.bin.notBack': 'Not brought back. {problem}',
  'admin.bin.people.none': 'No removed people.',
  'admin.bin.people.title': 'Removed people',
  'admin.bin.person.unnamed': 'Someone whose name was erased',
  'admin.bin.sub': 'What was removed from this league, and the way to bring each thing back.',
  // Beside the refusal when another team took the name (S-83): the way to that team.
  'admin.bin.takenBy': 'Open the team {name}',
  'admin.bin.team.games':
    'Games played: {played}. Games still to play: {toCome}. They come back with it.',
  'admin.bin.team.rosterInBin':
    'On its roster and in the bin too: {names}. The team comes back without them on the league list: bring them back as well, under Removed people.',
  'admin.bin.teamPage.body':
    'This team is in the bin. Bring it back and its roster and games come back with it.',
  'admin.bin.teamPage.title': 'This team is in the bin',
  'admin.bin.teams.none': 'No removed teams.',
  'admin.bin.teams.title': 'Removed teams',
  'admin.bin.title': 'Bin',
  // The home's one main action: the first of this person's jobs (step 2.103).
  'admin.home.action.games': 'Enter results',
  'admin.home.action.schedule': 'Open the schedule',
  'admin.home.action.settings': 'Open league settings',
  'admin.home.action.teams': 'Open teams',
  'admin.home.areas': 'Where to go',
  // The areas with no screen yet, named together under the cards.
  'admin.home.coming': 'Coming',
  'admin.home.nothingYet.body': 'What your role looks after in {league} will be listed here.',
  'admin.home.nothingYet.title': 'Nothing to do here yet',
  'admin.home.purpose.games': 'Results, box scores and who scores each game.',
  'admin.home.purpose.schedule': 'Rounds, games, places and times.',
  'admin.home.purpose.season': 'Who can see each season.',
  'admin.home.purpose.settings': 'The league’s rules and who sees what.',
  'admin.home.purpose.teams': 'Teams, rosters and jersey numbers.',
  'admin.home.sub': 'Everything you run for {league} is here.',
  'admin.home.title': 'Welcome back.',
  'admin.notReady.body': 'This part of the admin is not ready yet.',
  'admin.notReady.mark': 'Not ready',
  'admin.notReady.title': 'Not ready yet',
  'admin.status.archived': 'Archived',
  'admin.status.draft': 'Not published',
  'admin.status.suspended': 'Suspended',
  // The admin (P4 §3).
  'admin.title': 'Admin',
  'admin.trail': 'You are here',
  'admin.viewSite': 'View the site',
} as const;
