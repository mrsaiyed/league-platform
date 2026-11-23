// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The admin's games area, box scores and my games.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enAdminGames = {
  'admin.boxScore.back': 'Back to the games',
  'admin.boxScore.cellLabel': '{stat} for {name}',
  'admin.boxScore.columnsKey': 'What the columns are',
  'admin.boxScore.done.reopen': 'The game is reopened. Fix the grid and save it again.',
  'admin.boxScore.done.save': 'The box score is saved and the game is final.',
  // An empty box of a final game's grid, which is read and not filled in.
  'admin.boxScore.empty': '–',
  'admin.boxScore.error.did-not-play-has-stats':
    'A player marked as not playing has numbers. Tick “Played” or clear the numbers.',
  'admin.boxScore.error.game-is-tracked':
    'This game was scored with the live tracker, so it is corrected there.',
  'admin.boxScore.error.game-not-decided': 'That game is not final, so there is nothing to reopen.',
  'admin.boxScore.error.invalid-input':
    'Enter every number as a whole number from 0 to 999 (minutes up to 1440).',
  'admin.boxScore.error.player-listed-twice': 'A player is listed twice.',
  'admin.boxScore.error.player-not-on-team':
    'A player in the grid is no longer on that team’s roster. The page now shows the latest.',
  'admin.boxScore.error.reopen-reason':
    'Say why the game needs correcting (up to 1000 characters) to reopen it.',
  'admin.boxScore.error.reopen-time-over':
    'Your time to reopen this game is over. Ask a league admin or a scheduler.',
  'admin.boxScore.help':
    'Copy the paper score sheet. Tick each player who played; a player with any number filled in counts as played. Leave a whole column empty if the sheet did not keep that number; it then does not count in that player’s averages. In a column you fill in, an empty box counts as 0.',
  'admin.boxScore.jersey': '#{number}',
  'admin.boxScore.left': '(left the team)',
  'admin.boxScore.locked.cancelled': 'This game was cancelled, so it has no box score.',
  'admin.boxScore.locked.decided':
    'This game is final. To correct it, reopen it with a reason; then enter its result again.',
  // Step 2.158 (M32): a postponed game's own page offers no score entry.
  'admin.boxScore.locked.postponed':
    'This game is postponed, so it has no score yet. It is scored once it is played on its new date.',
  'admin.boxScore.locked.tracked':
    'This game was scored with the live tracker. Correct it in the tracker, so its list of plays still explains the numbers.',
  'admin.boxScore.minutes': 'Minutes',
  'admin.boxScore.minutes.short': 'MIN',
  'admin.boxScore.noPlayers': 'This team has no players on its roster yet. Add them in Teams.',
  'admin.boxScore.notFound': 'That game is not there, or you may not score it.',
  'admin.boxScore.played': 'Played',
  'admin.boxScore.playedBy': '{name} played',
  'admin.boxScore.player': 'Player',
  // A refused box beside the scores, naming it (step 2.155; A-4).
  'admin.boxScore.refused.cell': '{cell}: enter a whole number from 0 to 999, or leave it empty.',
  'admin.boxScore.refused.minutes':
    '{cell}: enter whole minutes from 0 to 1440, or leave it empty.',
  'admin.boxScore.refused.score':
    'Enter the score for {team} as a whole number from 0 to 999, or leave it empty to use the total of its players’ points.',
  'admin.boxScore.reopen': 'Reopen to correct',
  'admin.boxScore.reopenReason': 'Why it needs correcting (kept in the log, never shown publicly)',
  'admin.boxScore.save': 'Save box score and make it final',
  'admin.boxScore.saved': 'Saved: {result} is final, with its box score.',
  'admin.boxScore.scoreHelp':
    'Leave a team’s score empty to use the total of its players’ points. A score you type is saved as you typed it, even if the players’ points add up to something else.',
  'admin.boxScore.scoreMismatch':
    'Check {team}: the score you typed is {score}, but its players’ points add up to {points}. It will be saved as {score} unless you change it.',
  'admin.boxScore.teamShown': 'Team shown',
  'admin.boxScore.title': 'Box score: {away} at {home}',
  // A postponed or cancelled game's own page, which has no box score (step 2.158).
  'admin.boxScore.titleCalledOff': '{away} at {home}',
  // The box score grid (step 2.64).
  'admin.games.boxScore': 'Box score',
  // Step 2.158 (H9; A-5): "Forfeit, postpone or cancel" asks once, naming the game, and only
  // its "Yes" changes it. A scheduled game whose line-ups a scorer's table already set keeps
  // them (its question says so).
  'admin.games.callOff.ask.cancel':
    'Cancel {game}? Everyone will see it as cancelled, and it will count for nothing. You can put it back afterwards.',
  'admin.games.callOff.ask.cancelLineups':
    'Cancel {game}? Everyone will see it as cancelled, and it will count for nothing. You can put it back afterwards. The players already set for it at the scorer’s table are kept.',
  'admin.games.callOff.ask.forfeit':
    'Record a forfeit by {team} in {game}? {winner} win {winnerScore}–{loserScore}, the league’s forfeit score, and it counts in the standings.',
  'admin.games.callOff.ask.postpone':
    'Postpone {game}? Everyone will see it as postponed. It waits for a new date, and counts for nothing until it is played.',
  'admin.games.callOff.ask.postponeLineups':
    'Postpone {game}? Everyone will see it as postponed. It waits for a new date, and counts for nothing until it is played. The players already set for it at the scorer’s table are kept.',
  // A postponement made by mistake put back on its old date (S-75).
  'admin.games.callOff.ask.restore':
    'Put {game} back on its date, {when}? Everyone will see it as scheduled again.',
  'admin.games.callOff.chooseTeam': 'Choose a team',
  'admin.games.callOff.no.cancel': 'No, keep the game',
  'admin.games.callOff.no.forfeit': 'No, keep the game as it is',
  'admin.games.callOff.no.postpone': 'No, keep it on its date',
  'admin.games.callOff.no.restore': 'No, keep it postponed',
  // Said politely (a live region) when the question's "Yes" becomes ready (step 2.221).
  'admin.games.callOff.ready': 'You can answer now.',
  'admin.games.callOff.restore': 'Put it back',
  'admin.games.callOff.yes.cancel': 'Yes, cancel it',
  'admin.games.callOff.yes.forfeit': 'Yes, record the forfeit',
  'admin.games.callOff.yes.postpone': 'Yes, postpone it',
  'admin.games.callOff.yes.restore': 'Yes, put it back on its date',
  'admin.games.cancel': 'Cancel the game',
  'admin.games.confirm.ask': '{result}. Make this final?',
  'admin.games.confirm.early': '{result}. This game is set for {when}. Make it final now?',
  'admin.games.confirm.no': 'No, change the score',
  'admin.games.confirm.yes': 'Yes, make it final',
  // Putting a wrong result right (P7 §5.5, S-36): for whoever may reopen the game, and
  // who can for everyone else.
  'admin.games.correct': 'Correct this result',
  'admin.games.done.cancel': 'The game is cancelled.',
  'admin.games.done.final': 'The final score is saved.',
  'admin.games.done.forfeit': 'The forfeit is recorded.',
  'admin.games.done.postpone':
    'The game is postponed. It waits for a new date under “Waiting for a new date”.',
  'admin.games.done.putBack': 'The game is back on the schedule.',
  'admin.games.done.putBackDate': 'The game is back on its date.',
  'admin.games.done.putBackPostponed':
    'The game is back as it was: postponed, waiting for a new date.',
  'admin.games.done.reopen': 'The game is reopened. Enter the right result.',
  'admin.games.done.reopenTracked':
    'The game is live again. Correct it in the tracker, then end it again.',
  'admin.games.earlier.choose': 'Choose a round',
  'admin.games.earlier.days': '{first} to {last}',
  'admin.games.earlier.empty': 'There are no earlier games yet.',
  'admin.games.earlier.emptyYours': 'There are no earlier games you score yet.',
  'admin.games.earlier.filters': 'Earlier games',
  'admin.games.earlier.moreGames': 'Only the first {count} games of this round are shown.',
  'admin.games.earlier.moreRounds': 'Only the latest {count} rounds are offered.',
  'admin.games.earlier.noRound': 'Games outside a round',
  'admin.games.earlier.note':
    'Finished, forfeited, postponed and cancelled games from before today, one round at a time, to look back or correct a result.',
  'admin.games.earlier.option': '{round}, {days} ({count})',
  'admin.games.earlier.optionSeason': '{round}, {season}, {days} ({count})',
  'admin.games.earlier.pick': 'Choose a round to see its games.',
  'admin.games.earlier.round': 'Round',
  'admin.games.earlier.roundNumber': 'Round {number}',
  'admin.games.earlier.show': 'Show',
  'admin.games.earlier.title': 'Earlier games',
  // One wrong tap does no harm (step 2.154; A-5): the boxes open on the one game, and
  // saving asks once, naming both teams and the score, away team first as on the card.
  'admin.games.enterFinal': 'Enter the final score',
  'admin.games.error.changed-since-read':
    'Someone changed this game since you opened the page. It is shown again as it is now.',
  'admin.games.error.choose-reason': 'Choose why the game is put back.',
  'admin.games.error.choose-team': 'Choose the team that forfeits.',
  'admin.games.error.game-already-decided':
    'That game already has a final result. It can only be changed by reopening it.',
  'admin.games.error.game-cancelled': 'That game was cancelled, so it cannot be scored.',
  'admin.games.error.game-is-tracked':
    'Plays are being recorded for this game in the tracker, so it cannot be ended here. End it in the tracker.',
  'admin.games.error.game-not-called-off':
    'That game is not cancelled or postponed, so there is nothing to put back.',
  'admin.games.error.game-not-cancellable': 'Only a game that has not started can be cancelled.',
  'admin.games.error.game-not-found': 'That game is not there.',
  'admin.games.error.game-not-postponable': 'Only a game that has not started can be postponed.',
  'admin.games.error.game-now-cancelled':
    'Someone cancelled this game meanwhile, so nothing else was changed. It is shown again as it is now.',
  'admin.games.error.game-now-postponed':
    'Someone postponed this game meanwhile, so nothing else was changed. It is shown again as it is now.',
  'admin.games.error.game-part-in-bin':
    'One of this game’s teams, or its venue or court, is in the bin, so this game cannot be put back. Bring that back first, from the bin in League settings.',
  'admin.games.error.game-postponed':
    'That game is postponed, so it cannot have a score yet. Enter its score once it is played on its new date.',
  'admin.games.error.invalid-input': 'Enter the score as two whole numbers from 0 to 999.',
  'admin.games.error.not-allowed': 'You are not allowed to do that to this game.',
  'admin.games.error.team-not-in-game': 'That team is not in this game.',
  'admin.games.error.tie-not-allowed': 'This season does not allow ties. Enter a winner.',
  'admin.games.error.unknown': 'That did not work. Nothing was changed.',
  'admin.games.forfeitBy': 'Team that forfeits',
  // A save said beside the game it saved, naming it (step 2.155; A-4).
  'admin.games.game': '{away} at {home}',
  // The games area (step 2.55).
  // Step 2.156: the games that still need a result come first, however old, then today,
  // the week by day, and earlier games a round at a time.
  'admin.games.intro':
    'Games that still need a result come first, then today, this week and earlier games.',
  'admin.games.listProblem':
    'The games could not be shown. You may not have access to score or change games here.',
  'admin.games.needsResult.empty': 'Every game that has started has its result.',
  // For someone who scores only some games (a program, or the games assigned to them).
  'admin.games.needsResult.emptyYours': 'Every game you score that has started has its result.',
  'admin.games.needsResult.more':
    'Only the oldest {count} are shown. Enter their results and the next ones appear here.',
  'admin.games.needsResult.note':
    'Games whose start has passed and that have no result yet, oldest first.',
  'admin.games.needsResult.title': 'Needs a result',
  'admin.games.noScorekeeper': 'No scorekeeper yet',
  'admin.games.noTime': 'No time set',
  'admin.games.notScorable': 'This league is archived or suspended, so games cannot be changed.',
  'admin.games.openTracker': 'Open the tracker',
  'admin.games.otherActions': 'Forfeit, postpone or cancel',
  // A postponed game's panel: a forfeit or cancelling (step 2.158, S-75).
  'admin.games.otherActionsPostponed': 'Forfeit or cancel instead',
  'admin.games.postpone': 'Postpone',
  // On a postponed game's card: where it waits for its new date (step 2.158).
  'admin.games.postponedWaits': 'This game waits for a new date.',
  // A cancelled game put back (step 2.158, S-51), for whoever may cancel it, with why from
  // a fixed list (the activity log keeps fixed words only).
  'admin.games.putBack': 'Put this game back',
  'admin.games.putBack.choose': 'Choose why',
  // A postponement made by mistake put back on its old date (S-75): the same fixed list,
  // said of a postponement.
  'admin.games.putBack.date': 'Put it back on its date',
  'admin.games.putBack.reason':
    'Why are you putting it back? (Kept in the activity log, not shown to the public.)',
  'admin.games.putBack.reasons.cancelledByMistake': 'Cancelled by mistake',
  'admin.games.putBack.reasons.other': 'Another reason',
  'admin.games.putBack.reasons.willBePlayed': 'The game will be played after all',
  'admin.games.putBack.reasons.wrongGame': 'The wrong game was cancelled',
  'admin.games.putBack.reasonsDate.cancelledByMistake': 'Postponed by mistake',
  'admin.games.putBack.reasonsDate.other': 'Another reason',
  'admin.games.putBack.reasonsDate.willBePlayed': 'The game will be played on its date after all',
  'admin.games.putBack.reasonsDate.wrongGame': 'The wrong game was postponed',
  'admin.games.putBack.save': 'Put it back on the schedule',
  'admin.games.recordForfeit': 'Record forfeit',
  // A refused score said beside the boxes, naming the box or the score (step 2.155; A-4).
  'admin.games.refused.score': 'Enter the score for {team} as a whole number from 0 to 999.',
  'admin.games.refused.tie':
    '{result} is a tie, and this season does not allow ties. Change a score so one team wins.',
  'admin.games.refusedAbout': '{game}: {problem}',
  'admin.games.reopenUntil':
    'You ended this game in the tracker, so you can reopen it until {time}.',
  'admin.games.reopenWho.admins': 'Only a league admin or a scheduler can reopen this game.',
  'admin.games.reopenWho.time-over':
    'Your time to reopen this game is over. Only a league admin or a scheduler can reopen it now.',
  'admin.games.result': '{away} {awayScore}, {home} {homeScore}',
  'admin.games.saveScore': 'Save final score',
  'admin.games.saved.cancel': 'Saved: {game} is cancelled. “Put this game back” undoes it.',
  // Said at once after a game is put back over another game that took its place since
  // (step 2.158): the admin decides, and the publish preview lists the clash too.
  'admin.games.saved.clash':
    'Check its place: {others} also has one of its teams or its court at that time.',
  'admin.games.saved.final': 'Saved: {result} is final.',
  'admin.games.saved.forfeit':
    'Saved: {team} forfeited {game}. {winner} win {winnerScore}–{loserScore}.',
  'admin.games.saved.postpone':
    'Saved: {game} is postponed. It waits for a new date under “Waiting for a new date”.',
  'admin.games.saved.putBack': 'Saved: {game} is back on the schedule as a scheduled game.',
  'admin.games.saved.putBackDate': 'Saved: {game} is back on its date as a scheduled game.',
  'admin.games.saved.putBackPostponed':
    'Saved: {game} is back as it was before it was cancelled: postponed, waiting for a new date.',
  'admin.games.scoreGame': 'Score this game',
  'admin.games.scoreOf': 'Score for {team}',
  'admin.games.scorekeeper': 'Scorekeeper: {names}',
  'admin.games.toEarlier': 'Earlier games',
  'admin.games.today': 'Today, {time}',
  'admin.games.todayEmpty': 'No more games today.',
  'admin.games.todayTitle': 'Today',
  'admin.games.tomorrow': 'Tomorrow',
  // A game the live tracker has recorded plays of is ended there (S-46).
  'admin.games.tracked':
    'Plays are being recorded for this game in the tracker, so it is ended there, not by typing a score.',
  // Postponed games, each until it is given a new date (P7 §4 "Also", step 2.158). Giving
  // the new date from the list is step 2.53's; until then the note promises nothing.
  'admin.games.waiting.empty': 'No game is waiting for a new date.',
  'admin.games.waiting.link': 'See the games waiting for a new date',
  'admin.games.waiting.note':
    'Postponed games, oldest first. Each waits here until it is given a new date.',
  'admin.games.waiting.title': 'Waiting for a new date',
  'admin.games.weekEmpty': 'No more games in the next six days.',
  'admin.games.weekTitle': 'This week',
  'admin.games.when': '{day}, {time}',
  // Why a league's games are not scored (U-9), saying which.
  'admin.myGames.archived': 'This league is archived, so its games cannot be scored or changed.',
  'admin.myGames.empty': 'You have no games to score this week.',
  'admin.myGames.enterScore': 'Enter the score',
  'admin.myGames.intro': 'Tonight’s games first. Tap Score this game to open one.',
  'admin.myGames.recording.box-score': 'Box score',
  // A game whose score is entered in the games area, not in the tracker.
  'admin.myGames.recording.final-score': 'Final score only',
  'admin.myGames.score': 'Score this game',
  'admin.myGames.suspended': 'This league is suspended, so its games cannot be scored or changed.',
  // A scorekeeper's admin: only their games, each with a way to the tracker (P4 §4, step 2.33).
  'admin.myGames.title': 'Your games',
} as const;
