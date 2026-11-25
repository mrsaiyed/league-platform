// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The admin's teams and rosters.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enAdminTeams = {
  'adminTeams.add.choose': 'Choose a person',
  // The heading of the form that puts someone already in the league on this roster; the
  // form for a new player comes first (step 2.194's walk).
  'adminTeams.add.fromLeague': 'Someone already in the league',
  'adminTeams.add.noOne': 'Everyone in the league list is already on this roster.',
  // When the league's list of people has nobody in it at all.
  'adminTeams.add.nobody':
    'Nobody is in the league’s list yet. Add a new player with the form above.',
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
  // A team form refused because the team or the line changed meanwhile (step 2.155 part 3):
  // the screen keeps what was typed and shows "Saved now" beside it, and this says so.
  'adminTeams.changedMeanwhile':
    'Someone else changed this team since you opened this page, so it was not saved. What you typed is kept, and beside each box that differs is what is saved now. Save again to replace it with yours.',
  'adminTeams.confirm': 'Yes, I am sure',
  // A refused "Add team", beside the box it is about (step 2.155): each names its box.
  'adminTeams.create.problem.color':
    "The color could not be read. Choose it again, or tick “Use the league's own colors”.",
  'adminTeams.create.problem.name': "The team's name is needed, at most 120 characters.",
  'adminTeams.create.problem.shortName':
    'The short name can have only lower-case letters, numbers and single hyphens, like blue-jays.',
  // At the top of the new team's own page, beside its name, once (step 2.155).
  'adminTeams.create.saved': 'Saved: {name} was added to the season.',
  'adminTeams.create.submit': 'Add team',
  'adminTeams.create.title': 'Add a team',
  'adminTeams.done.added': 'The player was added to the roster.',
  'adminTeams.done.left': 'The player was marked as having left.',
  'adminTeams.done.moved': 'The roster order was saved.',
  'adminTeams.done.personRemoved':
    'Moved to the bin: taken off the league list, and kept in the bin for 30 days.',
  'adminTeams.done.putBack':
    'The player was put back on the roster. Their games and numbers are as they were.',
  'adminTeams.done.putBackNoNumber':
    'The player is back on the roster with no number, because someone else now wears theirs. Give them a number.',
  'adminTeams.done.removed': 'Moved to the bin: the team is kept there for 30 days.',
  'adminTeams.done.teamBack': 'The mark is off: the team is playing in the league again.',
  'adminTeams.done.teamLeft': 'The team is marked as having left the league.',
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
  // A refusal said beside the box it is about, naming it (step 2.155).
  'adminTeams.fieldRefused': '{field}: {why}',
  'adminTeams.find.allOnRoster': 'Everyone found here is already on this roster.',
  'adminTeams.find.clear': 'Show everyone',
  'adminTeams.find.foundFor': 'People whose name holds “{search}”.',
  'adminTeams.find.label': 'Find a person by name',
  'adminTeams.find.next': 'Next page',
  'adminTeams.find.nobody':
    'Nobody in the league list here. Try another name, or add them as someone new above.',
  'adminTeams.find.page': 'Page {page} of the league list, 200 to a page.',
  'adminTeams.find.previous': 'Previous page',
  'adminTeams.find.submit': 'Find',
  // After a team's name in the list, with the space before it: " (North)".
  'adminTeams.inDivision': ' ({division})',
  // S-87: a team that leaves the league mid-season. Its results stay, it is marked in
  // public, and it is offered for no new game; its games to come are the admin's to settle.
  'adminTeams.leftLeague.body':
    'If this team leaves the league mid-season, mark it here. Its results stay, so other teams’ records still add up. It is marked “Left the league” in the standings and on Teams, and it is offered for no new game. Its games still to come stay in the schedule: forfeit or cancel each one from Games.',
  'adminTeams.leftLeague.isLeft':
    'This team has left the league. Its results stay, it is marked “Left the league” in the standings and on Teams, and it is offered for no new game. Its games still to come are yours to forfeit or cancel, each one, from Games.',
  'adminTeams.leftLeague.mark': 'Mark as having left the league',
  'adminTeams.leftLeague.title': 'If this team leaves the league',
  'adminTeams.leftLeague.titleLeft': 'This team has left the league',
  'adminTeams.leftLeague.toLaterGames': 'See its games still to come',
  'adminTeams.leftLeague.undo': 'Take the mark off: it has not left',
  'adminTeams.leftLeague.undoBody':
    'Marked by mistake, or the team is back? Taking the mark off makes it a team of the league again, offered for new games.',
  'adminTeams.leftMark': 'Left the league',
  'adminTeams.newPerson.firstName': 'First name',
  'adminTeams.newPerson.lastName': 'Last name',
  'adminTeams.newPerson.submit': 'Add the person and put them on the roster',
  'adminTeams.newPerson.title': 'A new player, not in the league yet',
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
  // The bin has its screen (step 2.77): the notice after a removal leads to it.
  // A-17: only a team with no games, played or without a result, goes to the bin. The team
  // is "it" throughout the panel, as in step 2.161's "its roster".
  'adminTeams.remove.body':
    'A team with no games, played or waiting for a result, can be moved to the bin. It is kept for 30 days.',
  'adminTeams.remove.cannot':
    '{name} cannot be removed this season: its results are part of other teams’ records.',
  'adminTeams.remove.gamesUnknown':
    'How many games the team has could not be read just now. Reload the page to try again.',
  // Published games the draft removes: they hold the team until the draft is published.
  'adminTeams.remove.inDraft_one':
    '{count} of them is removed in the draft, which is not published yet: publish the schedule to finish.',
  'adminTeams.remove.inDraft_other':
    '{count} of them are removed in the draft, which is not published yet: publish the schedule to finish.',
  // Advice for a team with results that has left: never a way to remove it.
  'adminTeams.remove.leftAdvice':
    'If the team has left the league, mark it so above, under “If this team leaves the league”: it stays, with the games it played, and its games still to come are yours to forfeit or cancel in Games.',
  'adminTeams.remove.noDay': 'no day yet',
  'adminTeams.remove.notYet': '{name} cannot be removed yet: it has games without a result.',
  'adminTeams.remove.notYetWay':
    'Remove them from the schedule in Schedule, or cancel this week’s in Games. Do not record them as forfeited: a forfeit is a result, and a team with a result cannot be removed.',
  'adminTeams.remove.openNone': 'It has no game without a result.',
  // "{which}": up to three games, each adminTeams.remove.roundDay, joined by "; ".
  'adminTeams.remove.openWhich_one': 'It has {count} game without a result yet: {which}.',
  'adminTeams.remove.openWhich_other': 'It has {count} games without a result yet: {which}.',
  'adminTeams.remove.open_one': 'It has {count} game without a result yet.',
  'adminTeams.remove.open_other': 'It has {count} games without a result yet.',
  'adminTeams.remove.playedNone': 'This team has played no games.',
  'adminTeams.remove.played_one': 'This team has played {count} game.',
  'adminTeams.remove.played_other': 'This team has played {count} games.',
  'adminTeams.remove.rosterNone': 'Nobody is on its roster now.',
  'adminTeams.remove.rosterUnknown':
    'The roster could not be read just now, so how many people are on it is not shown.',
  'adminTeams.remove.roster_one':
    '{count} person is on its roster now. Once the team is removed, they can be taken off the league list.',
  'adminTeams.remove.roster_other':
    '{count} people are on its roster now. Once the team is removed, they can be taken off the league list.',
  'adminTeams.remove.roundDay': 'Round {round}, {day}',
  'adminTeams.remove.submit': 'Move the team to the bin',
  'adminTeams.remove.title': 'Remove this team',
  'adminTeams.remove.toGames': 'Go to Games',
  'adminTeams.remove.toPublish': 'Go to publishing',
  'adminTeams.remove.toSchedule': 'Go to Schedule',
  'adminTeams.roster.backAlready':
    'They are on this roster again, so there is nothing to put back.',
  'adminTeams.roster.entryLabel': 'The roster line of {name}',
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
  // S-84: a person on the roster who is in the bin, not on the league list (step 2.77).
  'adminTeams.roster.notOnTheList': '(not on the league list: in the bin)',
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
  'adminTeams.said.added': 'Saved: {name} was added to {team}.',
  'adminTeams.said.entrySaved': 'Saved: the number and role of {name}.',
  'adminTeams.said.left': '{name} was marked as having left {team}.',
  'adminTeams.said.putBack':
    '{name} is back on the roster. Their games and numbers are as they were.',
  'adminTeams.said.putBackNoNumber':
    '{name} is back on the roster with no number: {number} is now worn by {wearer}. Give them a number.',
  'adminTeams.said.putBackNoNumberNoWearer':
    '{name} is back on the roster with no number: someone else on the team now wears {number}. Give them a number.',
  // Beside the team's details, once, after they were saved (step 2.155).
  'adminTeams.saved.details': 'Saved: the details of {name}.',
  'adminTeams.saved.stats': 'Saved: who sees the numbers of {name}.',
  'adminTeams.savedNow': 'Saved now:',
  'adminTeams.savedNowNothing': '(nothing)',
  'adminTeams.seasonLine': 'Teams of {season}',
  'adminTeams.stats.everyone': 'Everyone',
  'adminTeams.stats.staff': "Only the team's staff and the league's admins",
  'adminTeams.stats.submit': 'Save who sees the numbers',
  'adminTeams.stats.title': "Who sees this team's numbers",
  'adminTeams.team.sub': 'This team’s details, who sees its numbers, and its roster.',
} as const;
