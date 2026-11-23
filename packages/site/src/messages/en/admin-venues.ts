// English interface text (T-187), one part of `en`, which ../en.ts joins:
// Admin → Schedule → Venues (step 2.49).
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
export const enAdminVenues = {
  'adminVenues.add.submit': 'Add the venue',
  'adminVenues.add.title': 'Add a venue',
  'adminVenues.change.label': 'Change {name}',
  'adminVenues.change.submit': 'Save',
  'adminVenues.court.add.label': 'Add a court to {venue}',
  'adminVenues.court.add.submit': 'Add the court',
  'adminVenues.court.add.title': 'Add a court',
  'adminVenues.court.change.label': 'Rename {name}',
  'adminVenues.court.field.name': 'Court name',
  'adminVenues.court.field.nameHelp': 'Such as Court 1, or Main court.',
  'adminVenues.court.games': 'Games: {played} played, {toCome} to come.',
  'adminVenues.court.gamesNone': 'No games on it yet.',
  'adminVenues.court.heldByGames_one':
    '{name} cannot be removed while a game is still to come on it. Move it to another court in Schedule first.',
  'adminVenues.court.heldByGames_other':
    '{name} cannot be removed while {count} games are still to come on it. Move them to another court in Schedule first.',
  'adminVenues.court.inDraft_one': 'Of those, 1 is only in the schedule draft so far.',
  'adminVenues.court.inDraft_other': 'Of those, {count} are only in the schedule draft so far.',
  'adminVenues.court.move.downLabel': 'Move {name} down',
  'adminVenues.court.move.upLabel': 'Move {name} up',
  'adminVenues.court.none':
    'No courts yet. Add one, even for a gym with a single court, so games can say where they are.',
  'adminVenues.court.remove.body': 'It goes to the bin, where it is kept for 30 days.',
  'adminVenues.court.remove.confirm': 'Yes, remove {name}',
  'adminVenues.court.remove.label': 'Remove {name}',
  'adminVenues.court.remove.played':
    'The games played on it keep its name. It goes to the bin, where it is kept for 30 days.',
  'adminVenues.court.remove.submit': 'Remove the court',
  'adminVenues.courts': 'Courts',
  'adminVenues.field.address': 'Address (if you like)',
  'adminVenues.field.addressHelp': 'Where people go, as they would type it into a map.',
  'adminVenues.field.mapLink': 'Map link (if you like)',
  'adminVenues.field.mapLinkHelp': 'A web address that starts with https://, from any map.',
  'adminVenues.field.name': 'Name',
  'adminVenues.field.nameHelp': 'Such as Central Gym. Up to 120 letters.',
  'adminVenues.games': 'Games here: {played} played, {toCome} to come.',
  'adminVenues.gamesNone': 'No games here yet.',
  'adminVenues.heldByCourts':
    '{name} can be removed once it has no courts. Remove its courts first.',
  'adminVenues.heldByGames_one':
    '{name} cannot be removed while a game is still to come there. Move it to another venue in Schedule first.',
  'adminVenues.heldByGames_other':
    '{name} cannot be removed while {count} games are still to come there. Move them to another venue in Schedule first.',
  'adminVenues.intro':
    'Where the league’s games are played. Each venue has its courts; a gym with one court has one.',
  'adminVenues.list': 'The league’s venues',
  'adminVenues.mapLink': 'Open the map',
  'adminVenues.move.down': 'Move down',
  'adminVenues.move.up': 'Move up',
  'adminVenues.none':
    'The league has no venues yet. Add the gym you play in, then its courts, so every game can say where it is.',
  'adminVenues.noneReadOnly': 'The league has no venues yet.',
  'adminVenues.problem.changed-since-read':
    'Someone else changed this just now. The screen shows it as it is now: try again.',
  'adminVenues.problem.court-has-games-to-come':
    'Games are still to come on this court. Move them to another court in Schedule first.',
  'adminVenues.problem.court-name-taken':
    'Another court of this venue has that name. Choose another one.',
  'adminVenues.problem.court-not-found':
    'That court is not there any more. The screen shows the courts as they are now.',
  'adminVenues.problem.court-venue-in-bin': 'Its venue is in the bin. Put the venue back first.',
  'adminVenues.problem.invalid-address':
    'Write the address in up to 300 letters, or leave it empty.',
  'adminVenues.problem.invalid-court': 'Give the court a name, of up to 120 letters.',
  'adminVenues.problem.invalid-map-link':
    'A map link is a web address that starts with https://. Copy it from the map, or leave it empty.',
  'adminVenues.problem.invalid-name': 'Give the venue a name, of up to 120 letters.',
  'adminVenues.problem.not-allowed': 'You cannot change the league’s venues.',
  'adminVenues.problem.not-confirmed': 'Tick the box first, to say you are sure.',
  'adminVenues.problem.restore-court-name-taken':
    'Another court of the venue has its name now. Rename that one, then put this one back.',
  'adminVenues.problem.restore-venue-name-taken':
    'Another venue has its name now. Rename that one, then put this one back.',
  'adminVenues.problem.unknown': 'That could not be done just now. Try again.',
  'adminVenues.problem.venue-has-courts': 'This venue still has courts. Remove them first.',
  'adminVenues.problem.venue-has-games-to-come':
    'Games are still to come at this venue. Move them to another venue in Schedule first.',
  'adminVenues.problem.venue-name-taken': 'Another venue has that name. Choose another one.',
  'adminVenues.problem.venue-not-found':
    'That venue is not there any more. The screen shows the venues as they are now.',
  'adminVenues.putBack.label': 'Put {name} back',
  'adminVenues.putBack.submit': 'Put it back',
  'adminVenues.readOnly':
    'Where the league’s games are played. Venues are shared by the whole league, so only someone who manages them for the whole league changes them.',
  'adminVenues.remove.body': 'It goes to the bin, where it is kept for 30 days.',
  'adminVenues.remove.confirm': 'Yes, remove {name}',
  'adminVenues.remove.label': 'Remove {name}',
  'adminVenues.remove.played':
    'The games played there keep its name. It goes to the bin, where it is kept for 30 days.',
  'adminVenues.remove.submit': 'Remove the venue',
  'adminVenues.said.courtCreated': 'Added: {name}.',
  'adminVenues.said.courtMoved': 'Moved: {name}.',
  'adminVenues.said.courtRemoved': 'Removed: {name}. It is kept in the bin for 30 days.',
  'adminVenues.said.courtRestored': 'Put back: {name}.',
  'adminVenues.said.courtSaved': 'Saved: {name}.',
  'adminVenues.said.created': 'Added: {name}. Now add its courts.',
  'adminVenues.said.removed': 'Removed: {name}. It is kept in the bin for 30 days.',
  'adminVenues.said.restored': 'Put back: {name}.',
  'adminVenues.said.saved': 'Saved: {name}.',
  'adminVenues.title': 'Venues',
  'adminVenues.toSchedule': 'Go to the schedule',
} as const;
