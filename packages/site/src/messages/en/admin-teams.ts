// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The admin's teams and rosters.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enAdminTeams = {
  'adminTeams.add.choose': 'Choose a person',
  'adminTeams.add.noOne': 'Everyone in the league list is already on this roster.',
  // Step 2.157: for a role that may not read the league's list of people (a club admin).
  'adminTeams.add.notAllowed':
    "Your role in this league does not include its list of people, so no one can be chosen from it here. If it should, ask the league's owner or an admin.",
  'adminTeams.add.number': 'Jersey number (0 to 99, or 00)',
  'adminTeams.add.person': 'Person',
  'adminTeams.add.readFailed':
    'The roster or the league list could not be read just now. Reload the page to try again.',
  'adminTeams.add.role': 'Role',
  'adminTeams.add.submit': 'Add to the roster',
  'adminTeams.add.title': 'Add a player',
  'adminTeams.allTeams': 'All teams',
  'adminTeams.byNumber': '#{number}',
  'adminTeams.confirm': 'Yes, I am sure',
  'adminTeams.create.submit': 'Add team',
  'adminTeams.create.title': 'Add a team',
  'adminTeams.done.added': 'The player was added to the roster.',
  'adminTeams.done.created': 'The team was added.',
  'adminTeams.done.entrySaved': 'The number and role were saved.',
  'adminTeams.done.left': 'The player was marked as having left.',
  'adminTeams.done.moved': 'The roster order was saved.',
  'adminTeams.done.personRemoved':
    'Removed from the league list. The person is kept for 30 days; the screen to bring them back is not ready yet.',
  'adminTeams.done.putBack':
    'The player was put back on the roster. Their games and numbers are as they were.',
  'adminTeams.done.putBackNoNumber':
    'The player is back on the roster with no number, because someone else now wears theirs. Give them a number.',
  'adminTeams.done.removed':
    'Removed. The team is kept for 30 days; the screen to bring it back is not ready yet.',
  'adminTeams.done.statsSaved': 'Who sees the numbers was saved.',
  'adminTeams.done.updated': 'The team was saved.',
  'adminTeams.edit.submit': 'Save team details',
  'adminTeams.edit.title': 'Team details',
  'adminTeams.field.color': 'Color',
  'adminTeams.field.division': 'Division',
  'adminTeams.field.name': 'Name',
  'adminTeams.field.shortName': "Short name, used in the team's address",
  'adminTeams.field.shortNameHint': 'Lower-case letters and numbers, with single hyphens.',
  'adminTeams.field.statsVisibility': "Who sees this team's players' numbers",
  'adminTeams.field.useOwnColors': "Use the league's own colors",
  // After a team's name in the list, with the space before it: " (North)".
  'adminTeams.inDivision': ' ({division})',
  'adminTeams.newPerson.firstName': 'First name',
  'adminTeams.newPerson.lastName': 'Last name',
  'adminTeams.newPerson.submit': 'Add the person and put them on the roster',
  'adminTeams.newPerson.title': 'Someone not in the list yet',
  'adminTeams.noDivision': 'No division',
  'adminTeams.noName': 'No name yet',
  // The admin's Teams screens (step 2.51, P4 §3, P7 §2).
  'adminTeams.noSeason': 'This league has no current season yet. Add one in Season settings first.',
  'adminTeams.none': 'No teams yet.',
  'adminTeams.openRoster': 'Roster',
  'adminTeams.ownColors': "The league's own colors",
  'adminTeams.people.body':
    'Taking someone off the list is refused while they are on a roster: mark them as having left first. A place on a team that was moved to the bin does not count.',
  // Step 2.157: for a role that may not read the league's list of people (a club admin).
  'adminTeams.people.notAllowed':
    'Your role in this league does not include its list of people, so it is not shown here.',
  'adminTeams.people.readFailed':
    'The league list could not be read just now, so it is not shown. Reload the page to try again.',
  'adminTeams.people.remove': 'Remove from the league list',
  'adminTeams.people.title': 'The league list',
  // A person's name as the Teams screens show it; a language may put the parts the other way.
  'adminTeams.personName': '{firstName} {lastName}',
  // Until step 2.77 gives the bin a screen, nothing here promises a way back (step 2.161).
  'adminTeams.remove.body':
    'The team is moved to the bin. Its games and numbers are kept. It is kept for 30 days; the screen to bring it back is not ready yet.',
  'adminTeams.remove.rosterNone': 'Nobody is on its roster now.',
  'adminTeams.remove.rosterUnknown':
    'The roster could not be read just now, so how many people are on it is not shown.',
  'adminTeams.remove.roster_one':
    '{count} person is on its roster now. Once the team is removed, they can be taken off the league list.',
  'adminTeams.remove.roster_other':
    '{count} people are on its roster now. Once the team is removed, they can be taken off the league list.',
  'adminTeams.remove.submit': 'Move the team to the bin',
  'adminTeams.remove.title': 'Remove this team',
  'adminTeams.roster.backAlready':
    'They are on this roster again, so there is nothing to put back.',
  'adminTeams.roster.leftLine': '{name}, left on {date}',
  'adminTeams.roster.leftOn': 'Left on',
  'adminTeams.roster.leftOnHelp': 'The day they left: today or a day before.',
  'adminTeams.roster.leftTitle': 'Left the team',
  'adminTeams.roster.markLeft': 'Mark as left',
  'adminTeams.roster.moveDown': 'Move down',
  'adminTeams.roster.moveUp': 'Move up',
  'adminTeams.roster.name': 'Name',
  'adminTeams.roster.noNumber': 'No number',
  'adminTeams.roster.none': 'Nobody is on this roster yet.',
  'adminTeams.roster.number': 'Number',
  'adminTeams.roster.numberTwice': '(#{number} is worn by two players)',
  'adminTeams.roster.offTheList':
    'They were taken off the league list, so they cannot be put back on the roster.',
  'adminTeams.roster.putBack': 'Put back on the roster (marked by mistake)',
  'adminTeams.roster.readFailed':
    'The roster could not be read just now, so it is not shown. Reload the page to try again.',
  'adminTeams.roster.role': 'Role',
  'adminTeams.roster.role.captain': 'Captain',
  'adminTeams.roster.role.coach': 'Coach',
  'adminTeams.roster.role.player': 'Player',
  'adminTeams.roster.saveEntry': 'Save number and role',
  'adminTeams.roster.title': 'Roster',
  'adminTeams.roster.toReview': '(added at the scorer’s table, to review)',
  // Said on the player's own line, naming them (step 2.161; R-32 for the number).
  'adminTeams.said.left': '{name} was marked as having left {team}.',
  'adminTeams.said.putBack':
    '{name} is back on the roster. Their games and numbers are as they were.',
  'adminTeams.said.putBackNoNumber':
    '{name} is back on the roster with no number: {number} is now worn by {wearer}. Give them a number.',
  'adminTeams.said.putBackNoNumberNoWearer':
    '{name} is back on the roster with no number: someone else on the team now wears {number}. Give them a number.',
  'adminTeams.seasonLine': 'Teams of {season}',
  'adminTeams.stats.everyone': 'Everyone',
  'adminTeams.stats.staff': "Only the team's staff and the league's admins",
  'adminTeams.stats.submit': 'Save who sees the numbers',
  'adminTeams.stats.title': "Who sees this team's numbers",
  'adminTeams.team.sub': 'This team’s details, who sees its numbers, and its roster.',
} as const;
