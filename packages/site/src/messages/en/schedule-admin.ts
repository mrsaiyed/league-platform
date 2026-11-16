// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The admin's schedule screens.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enScheduleAdmin = {
  'schedule.admin.addGame': 'Add a game',
  'schedule.admin.addGameSubmit': 'Add game',
  'schedule.admin.addRound': 'Add a round',
  'schedule.admin.addRoundDate': 'Round date',
  'schedule.admin.addRoundError.date': 'Choose the day the round is played.',
  'schedule.admin.addRoundError.name': 'Give the round a name.',
  'schedule.admin.addRoundName': 'Round name',
  'schedule.admin.addRoundNameHelp': 'For example "Week 1" or "Opening night".',
  'schedule.admin.addRoundNote':
    'The round goes after the others. Its games default to this date. Nobody else sees it until you publish.',
  'schedule.admin.addRoundSubmit': 'Add round',
  'schedule.admin.askToShow': "Ask the league's owner or an admin to show it.",
  'schedule.admin.away': 'Away team',
  'schedule.admin.blocker.change-no-longer-fits':
    'A change in the draft no longer fits the schedule.',
  'schedule.admin.blocker.draft-unreadable': 'The saved draft cannot be read.',
  'schedule.admin.blocker.game-already-started':
    'The draft changes a game that has already started or been decided.',
  'schedule.admin.blocker.game-cannot-be-removed':
    'The draft removes a game that has already been scored.',
  'schedule.admin.blocker.game-id-taken': 'A game in the draft already exists elsewhere.',
  'schedule.admin.blocker.game-without-time': 'A new game in the draft has no time.',
  'schedule.admin.blocker.nothing-to-publish': 'The draft changes nothing.',
  'schedule.admin.blocker.revision-out-of-date':
    'A newer schedule was published after this draft was started.',
  'schedule.admin.blocker.round-in-use':
    'The draft removes a round that a game in the bin or with no date is still in.',
  'schedule.admin.blocker.unknown-court': 'A game in the draft names a court that is gone.',
  'schedule.admin.blocker.unknown-team':
    'A game in the draft names a team that is not in the season.',
  'schedule.admin.blocker.unknown-venue': 'A game in the draft names a venue that is gone.',
  'schedule.admin.changeRoundDate': 'Round date',
  'schedule.admin.changeRoundDateNote':
    'Games on the old date move to the new date with the round.',
  'schedule.admin.changeRoundDateSubmit': 'Change round date',
  'schedule.admin.chooseTeam': 'Choose a team',
  'schedule.admin.clash.court': '{place} is booked twice at {time} on {date}: {games}.',
  'schedule.admin.clash.skipped': '{game} is on {date}, a date the league skips.',
  'schedule.admin.clash.team': '{team} is in two games at {time} on {date}: {games}.',
  'schedule.admin.clashFlag': 'Clash: this game shares a team or a court with another game.',
  'schedule.admin.clashes': 'Clashes to fix',
  'schedule.admin.clashesNone': 'No clashes.',
  'schedule.admin.date': 'Date',
  'schedule.admin.discard': 'Discard the draft',
  'schedule.admin.discardNote': 'This throws away every unpublished change. It cannot be undone.',
  'schedule.admin.discardSubmit': 'Discard all draft changes',
  'schedule.admin.discarded': 'The draft was discarded.',
  'schedule.admin.draftChangesNone':
    'Draft in progress: as it stands it changes nothing in the published schedule.',
  'schedule.admin.draftChanges_one': 'Draft in progress: {count} change not yet published.',
  'schedule.admin.draftChanges_other': 'Draft in progress: {count} changes not yet published.',
  'schedule.admin.draftOutOfDate':
    'A new version of the schedule was published after this draft was started. Discard the draft and start again from the published schedule.',
  'schedule.admin.edit': 'Edit this game',
  'schedule.admin.error.change-no-longer-fits': 'A change in the draft no longer fits.',
  'schedule.admin.error.change-refused': 'That change cannot be made to the schedule as it stands.',
  'schedule.admin.error.changed-since-read':
    'Someone else changed the schedule draft since you opened it. The page now shows their changes.',
  'schedule.admin.error.draft-not-found': 'There is no draft to work on.',
  'schedule.admin.error.draft-too-large':
    'The draft has grown too large. Publish it or discard it first.',
  'schedule.admin.error.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'schedule.admin.error.game-already-started':
    'A game in the draft has already started or been decided.',
  'schedule.admin.error.game-cannot-be-removed': 'A game in the draft has already been scored.',
  'schedule.admin.error.game-id-taken': 'A game in the draft already exists elsewhere.',
  'schedule.admin.error.game-without-time': 'A new game in the draft has no time.',
  'schedule.admin.error.invalid-input': 'Something in the form is missing or not valid.',
  'schedule.admin.error.no-account': 'You need to be signed in.',
  'schedule.admin.error.not-allowed': 'You do not have permission to do that.',
  'schedule.admin.error.nothing-to-publish': 'The draft changes nothing.',
  'schedule.admin.error.nothing-to-put-back':
    'That game is no longer waiting to be put back: the draft was published or discarded since, so nothing was added.',
  'schedule.admin.error.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'schedule.admin.error.round-cannot-be-added':
    'A new round in the draft could not be added to the season. Discard the draft and add it again.',
  'schedule.admin.error.round-cannot-be-updated': 'A round in the draft is gone from the season.',
  'schedule.admin.error.round-in-use':
    'A game that is in the bin, has no date yet or was removed in this draft is still in this round, so it cannot be removed.',
  'schedule.admin.error.season-not-found': 'That season is not there.',
  'schedule.admin.error.unknown-court': 'That court is not at the chosen venue.',
  'schedule.admin.error.unknown-team': 'One of those teams is not in this season.',
  'schedule.admin.error.unknown-venue': 'That venue is not there.',
  'schedule.admin.followRoundDate': 'Move it to {date} too?',
  'schedule.admin.followRoundDateNo': 'No, keep {date}',
  'schedule.admin.followRoundDateYes': 'Yes, move it to {date}',
  'schedule.admin.gameDetails': '{when}, {place}',
  'schedule.admin.gameDetailsRecording': '{when}, {place}, {recording}',
  'schedule.admin.gameLocked':
    'This game has started or been decided, so it cannot be edited here.',
  'schedule.admin.gameNotScheduled': 'This game is {status}. It is left as it is here.',
  'schedule.admin.gameVs': '{away} at {home}',
  'schedule.admin.gameWhen': '{date}, {time}',
  'schedule.admin.gameWhere': '{venue}, {court}',
  'schedule.admin.home': 'Home team',
  'schedule.admin.importLink': 'Import fixtures from a spreadsheet',
  'schedule.admin.intro':
    'Build the schedule here, round by round. Every change is saved to a draft that only you and the other schedulers see. Nothing reaches the public site until you publish it.',
  'schedule.admin.moveToRoundDate': 'Move it to {date}',
  'schedule.admin.noDate': 'no date',
  'schedule.admin.noDraft': 'There is no draft yet. You are looking at the published schedule.',
  'schedule.admin.noDraftHidden':
    'No changes are waiting. This season is not public yet, so visitors see none of its schedule.',
  'schedule.admin.noGamesInRound': 'No games in this round yet.',
  'schedule.admin.noPlace': 'no venue yet',
  'schedule.admin.noPlaceOption': 'No venue yet',
  'schedule.admin.noRound': 'No round',
  'schedule.admin.noRounds': 'This season has no rounds yet.',
  'schedule.admin.noRoundsHelp': 'Add the first one here, then add its games.',
  'schedule.admin.noSeason': 'There is no season to schedule yet.',
  'schedule.admin.noTime': 'time to be set',
  'schedule.admin.offRoundDate': 'This game falls outside {round}, which is on {date}.',
  'schedule.admin.otherGames': 'Games with no round',
  'schedule.admin.place': 'Venue and court',
  'schedule.admin.problem': 'That was not saved: {reason}',
  'schedule.admin.problemPartial':
    'The new time and place were saved to the draft, but the recording change was not: {reason}',
  'schedule.admin.publish': 'Publish',
  'schedule.admin.publishBlocked': 'It cannot be published yet:',
  'schedule.admin.publishClashes_one': '{count} clash is still in the schedule.',
  'schedule.admin.publishClashes_other': '{count} clashes are still in the schedule.',
  'schedule.admin.publishNothing': 'There is nothing to publish.',
  'schedule.admin.publishRounds':
    'Rounds added: {added}. Rounds removed: {removed}. Rounds renamed: {renamed}. Round dates changed: {dates}.',
  'schedule.admin.publishSubmit': 'Publish this schedule',
  'schedule.admin.publishSummary':
    'Publishing will add {added}, move {moved}, remove {removed}, and change how {recorded} are recorded. It reaches {teams} teams and {people} people.',
  'schedule.admin.published': 'The schedule is published. Visitors can see it now.',
  'schedule.admin.publishedBothHidden':
    'The schedule is published, but visitors cannot see this league until it is published, and {season} is hidden from them too.',
  'schedule.admin.publishedLeagueHidden':
    'The schedule is published, but visitors cannot see this league until it is published.',
  'schedule.admin.publishedSeasonHidden':
    'The schedule is published, but visitors cannot see {season} yet.',
  'schedule.admin.putBack': 'Put it back',
  'schedule.admin.recording': 'How it is recorded',
  'schedule.admin.recording.box-score': 'Box score',
  'schedule.admin.recording.final-score': 'Final score only',
  'schedule.admin.recording.live': 'Live scoring',
  'schedule.admin.recording.rules': 'Follow the season rules',
  'schedule.admin.refused.date-out-of-range': 'Choose a date between the years {first} and {last}.',
  'schedule.admin.refused.empty-round-label': 'A round needs a name.',
  'schedule.admin.refused.game-exists': 'That game is already in the schedule.',
  'schedule.admin.refused.invalid-date': 'That is not a date.',
  'schedule.admin.refused.invalid-time': 'That is not a time.',
  'schedule.admin.refused.round-exists': 'That round is already in the schedule.',
  'schedule.admin.refused.round-has-games':
    'This round has games. Move or remove its games first, then remove the round.',
  'schedule.admin.refused.swap-with-itself': 'Choose a different game to swap with.',
  'schedule.admin.refused.team-plays-itself': 'A team cannot play itself.',
  'schedule.admin.refused.too-many-rounds':
    'This season has used every round number up to {max}. Start a new season to add more rounds.',
  'schedule.admin.refused.unknown-game': 'That game is not in the schedule.',
  'schedule.admin.refused.unknown-round': 'That round is not in the schedule.',
  'schedule.admin.rejected_one':
    '{count} change in the draft no longer fits the schedule and is being left out.',
  'schedule.admin.rejected_other':
    '{count} changes in the draft no longer fit the schedule and are being left out.',
  'schedule.admin.remove': 'Remove game',
  'schedule.admin.removeRound': 'Remove this round',
  'schedule.admin.removeRoundBlocked_one':
    'This round has {count} game, so it cannot be removed. Move or remove its game first.',
  'schedule.admin.removeRoundBlocked_other':
    'This round has {count} games, so it cannot be removed. Move or remove its games first.',
  'schedule.admin.removeRoundNote': 'It has no games, so it can be removed from the draft.',
  'schedule.admin.removedDraftOnly':
    'It was only in the draft, so nothing public has changed. Put it back and it is exactly as it was.',
  'schedule.admin.removedPublished':
    'Nothing public changes until you publish. Put it back now and it is exactly as it was. Once the draft is published it is kept for 30 days; the screen to bring it back is not ready yet.',
  'schedule.admin.renameRound': 'Round name',
  'schedule.admin.renameRoundSubmit': 'Rename round',
  'schedule.admin.round': 'Round {number}: {label}',
  'schedule.admin.roundDate': 'Date: {date}',
  'schedule.admin.roundEdit': 'Change or remove this round',
  'schedule.admin.roundField': 'Round',
  'schedule.admin.roundGames_one': '{count} game',
  'schedule.admin.roundGames_other': '{count} games',
  'schedule.admin.roundNoDate': 'No date set',
  'schedule.admin.save': 'Save game',
  'schedule.admin.saved': 'Saved to the draft. It is not public until you publish.',
  'schedule.admin.savedGame': 'Saved to the draft: {game}.',
  'schedule.admin.savedGamePutBack': 'Put back in the draft: {game}, as it was.',
  'schedule.admin.savedGameRemoved': 'Saved to the draft: a game was removed here.',
  // Removing a game from the draft, and putting it back in one tap (step 2.161).
  'schedule.admin.savedGameRemovedNamed': 'Removed: {game}, {round}.',
  'schedule.admin.savedGameRemovedNoRound': 'Removed: {game}, from the games with no round.',
  'schedule.admin.savedGameRound': 'Saved to the draft: {game} is now in {round}.',
  'schedule.admin.savedRound': 'Saved to the draft: {round}.',
  'schedule.admin.savedRoundAdded':
    'Saved to the draft: {round} was added. It is not public until you publish.',
  'schedule.admin.savedRoundRemoved':
    'Saved to the draft: the round was removed. It is not public until you publish.',
  'schedule.admin.seasonName': 'Season: {name}',
  'schedule.admin.seasonNotPublic': '{name} (not public yet)',
  'schedule.admin.showInSeasonSettings': 'Show it in Season settings.',
  'schedule.admin.swapChoose': 'Choose a game',
  'schedule.admin.swapNote': 'The two games trade rounds, dates, times and courts. The teams stay.',
  'schedule.admin.swapOption': '{game}, {date}',
  'schedule.admin.swapSubmit': 'Swap',
  'schedule.admin.swapWith': 'Swap places with',
  'schedule.admin.time': 'Time',
  // Admin → Schedule: the grid of rounds and games (step 2.52).
  'schedule.admin.title': 'Schedule',
  'schedule.admin.venueCourt': '{venue}: {court}',
  'schedule.admin.venueOnly': '{venue} (any court)',
} as const;
