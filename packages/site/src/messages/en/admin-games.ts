// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The admin's games area, box scores and my games.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enAdminGames = {
  'admin.boxScore.back': 'Back to the games',
  'admin.boxScore.cellLabel': '{stat} for {name}',
  'admin.boxScore.columnsKey': 'What the columns are',
  // Step 2.229 (T-366): the box score put back as it was before the game was reopened.
  'admin.boxScore.done.putBack':
    'The box score is back as it was before the game was reopened, and the game is final again.',
  'admin.boxScore.done.reopen': 'The game is reopened. Fix the grid and save it again.',
  'admin.boxScore.done.reopenTracked':
    'The game is live again. Correct it with “Edit the box score” below, or on the scoring screen, then tap “End the game again”.',
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
  'admin.boxScore.error.not-recorded-by-hand':
    'This game was ended from the tracker. Reopen it there, or ask a league admin or a scheduler.',
  'admin.boxScore.error.not-recorded-by-you':
    'Someone else recorded this result, so only a league admin or a scheduler can reopen it.',
  'admin.boxScore.error.player-listed-twice': 'A player is listed twice.',
  'admin.boxScore.error.player-not-on-team':
    'A player in the grid is no longer on that team’s roster. The page now shows the latest.',
  'admin.boxScore.error.reopen-reason':
    'Say why the game needs correcting (up to 1000 characters) to reopen it.',
  'admin.boxScore.error.reopen-time-over':
    'Your time to reopen this game is over. Ask a league admin or a scheduler.',
  'admin.boxScore.error.result-overturned':
    'This result was overturned. Take the overturn off in Standings and stats first.',
  'admin.boxScore.error.scorekeepers-may-not-reopen':
    'This league does not let scorekeepers reopen a result. Only a league admin or a scheduler can.',
  'admin.boxScore.error.season-archived':
    "This game's season is archived, so it is read-only. Nothing was saved. Reopen the game with a reason first (a correction).",
  'admin.boxScore.help':
    'Copy the paper score sheet. Tick each player who played; a player with any number filled in counts as played. Leave a whole column empty if the sheet did not keep that number; it then does not count in that player’s averages. In a column you fill in, an empty box counts as 0.',
  'admin.boxScore.jersey': '#{number}',
  'admin.boxScore.left': '(left the team)',
  'admin.boxScore.locked.archived':
    'This league is archived, so its games can be viewed but not changed.',
  'admin.boxScore.locked.cancelled': 'This game was cancelled, so it has no box score.',
  'admin.boxScore.locked.decided':
    'This game is final. To correct it, reopen it with a reason; then enter its result again.',
  // Step 2.158 (M32): a postponed game's own page offers no score entry.
  'admin.boxScore.locked.postponed':
    'This game is postponed, so it has no score yet. It is scored once it is played on its new date.',
  'admin.boxScore.locked.suspended':
    'This league is suspended, so its games can be viewed but not changed.',
  'admin.boxScore.locked.tracked':
    'This game was scored with the live tracker. Correct it with “Edit the box score”, or on the scoring screen to take points away; either way its list of plays still explains the numbers.',
  'admin.boxScore.minutes': 'Minutes',
  'admin.boxScore.minutes.short': 'MIN',
  'admin.boxScore.noPlayers': 'This team has no players on its roster yet. Add them in Teams.',
  'admin.boxScore.notFound': 'That game is not there, or you may not score it.',
  'admin.boxScore.played': 'Played',
  'admin.boxScore.playedBy': '{name} played',
  'admin.boxScore.player': 'Player',
  // Step 2.229 (A-5, T-366): a reopened box score saved again without its players' lines
  // (a final score only, a forfeit) can be put back as the reopen kept it, until something
  // newer is saved on the game. Only for whoever may correct games.
  'admin.boxScore.putBack': 'Put the sheet back as it was',
  'admin.boxScore.putBackError.game-not-decided':
    'This game is reopened right now, so its sheet cannot be put back. Save its result first.',
  'admin.boxScore.putBackError.newer-save':
    'Something newer was saved on this game, so the sheet can no longer be put back as it was.',
  'admin.boxScore.putBackError.no-sheet-kept':
    'Something newer was saved on this game, so the sheet can no longer be put back as it was.',
  // Step 2.229 fix round: a sheet that names a player in the bin (or on a team in the bin),
  // one purged from the bin since, and a game scored live on the tracker since its reopen
  // (its plays stay), are not put back.
  'admin.boxScore.putBackError.player-gone':
    'A player on the kept sheet has since been deleted from the league for good, so the sheet can no longer be put back as it was.',
  'admin.boxScore.putBackError.player-in-bin':
    'A player on the kept sheet, or their team, is in the bin. Restore them from the bin first, then put the sheet back.',
  'admin.boxScore.putBackError.put-back-reason':
    'Say why the sheet goes back (up to 1000 characters) to put it back.',
  'admin.boxScore.putBackError.scored-live':
    'This game was scored live since it was reopened, so its plays decide its sheet: the old sheet can no longer be put back.',
  'admin.boxScore.putBackHelp':
    'This game was reopened and then saved again. Its box score from before the reopen was kept: you can put it back as it was, with its players’ lines and its score.',
  'admin.boxScore.putBackReason': 'Why the sheet goes back (kept in the log, never shown publicly)',
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
  // Step 2.65 (T6 §8, T-122, T-405): a tracked game's box score edited in a grid; each
  // change is saved as a play, so the game's list of plays still explains the numbers.
  'admin.boxScore.tracked.added.foul': 'Added a foul for {name}.',
  'admin.boxScore.tracked.added.score1': 'Added a made free throw for {name}.',
  'admin.boxScore.tracked.added.score2': 'Added a 2-point basket for {name}.',
  'admin.boxScore.tracked.added.score3': 'Added a 3-point basket for {name}.',
  'admin.boxScore.tracked.added.turnover': 'Added a turnover for {name}.',
  'admin.boxScore.tracked.edit': 'Edit the box score',
  // Step 2.65 fix round (T-407): the scoring screen's own end, from the admin's pages.
  'admin.boxScore.tracked.endAgain': 'End the game again',
  'admin.boxScore.tracked.endAgainHelp':
    'When the numbers are right, end the game again. It becomes final, marked Corrected, and the standings count it. A device still scoring it is told at its next tap.',
  'admin.boxScore.tracked.help':
    'Change a player’s numbers and save. Each change is saved as a play in the game’s list of plays, so the list still explains the numbers. Minutes and points come from the plays and cannot be typed here.',
  'admin.boxScore.tracked.lower':
    'Lowering a player’s baskets takes back their latest baskets of that kind, as plays in the list. To move points to another player, lower one and raise the other. You can also correct the game on the scoring screen.',
  'admin.boxScore.tracked.lowerLink': 'Open the scoring screen',
  'admin.boxScore.tracked.noChange': 'Nothing was changed: the grid already matched the plays.',
  'admin.boxScore.tracked.notCorrectable.game-final':
    'This game is final. To edit its box score, reopen it with a reason first.',
  'admin.boxScore.tracked.notCorrectable.game-not-live':
    'This game is not under way, so its box score cannot be edited here.',
  'admin.boxScore.tracked.notCorrectable.league-read-only':
    'This league is archived or suspended, so this box score can be viewed but not changed.',
  'admin.boxScore.tracked.notCorrectable.reason-needed':
    'This game is still being scored live. To edit its box score here, end it on the scoring screen, then reopen it with a reason.',
  'admin.boxScore.tracked.refused.basket-not-in-plays':
    '{cell}: the list of plays does not hold that many of these baskets to take back. Load the grid again to see the plays’ numbers. Nothing was saved.',
  'admin.boxScore.tracked.refused.cell': '{cell}: enter a whole number from 0 to 999.',
  'admin.boxScore.tracked.refused.changed-since-read':
    'Someone else changed this game since you opened this page, so nothing was saved. Load it again to see the new numbers; what you typed is still shown below.',
  'admin.boxScore.tracked.refused.engine':
    '{cell}: the game’s scoring rules would not take this change. Nothing was saved.',
  'admin.boxScore.tracked.refused.gone':
    'This game can no longer be edited here, so nothing was saved. Load the page again.',
  'admin.boxScore.tracked.refused.player-not-on-team':
    '{cell}: this player is not on the team’s roster for this game. Nothing was saved.',
  'admin.boxScore.tracked.refused.statistic-not-kept':
    '{cell}: this season does not keep that number. Nothing was saved.',
  'admin.boxScore.tracked.refused.tie-not-allowed':
    'The score is level, and this season’s rules do not allow a tie, so the game was not ended. Add the deciding points first.',
  'admin.boxScore.tracked.refused.too-many-plays':
    'This save would add more than {limit} plays, so nothing was saved. Check for a mistyped number.',
  'admin.boxScore.tracked.reload': 'Load it again',
  'admin.boxScore.tracked.removed.foul': 'Took a foul away from {name}.',
  'admin.boxScore.tracked.removed.score1':
    'Took back a made free throw of {name}, the one made in period {period}.',
  'admin.boxScore.tracked.removed.score2':
    'Took back a 2-point basket of {name}, the one made in period {period}.',
  'admin.boxScore.tracked.removed.score3':
    'Took back a 3-point basket of {name}, the one made in period {period}.',
  'admin.boxScore.tracked.removed.turnover': 'Took a turnover away from {name}.',
  'admin.boxScore.tracked.save': 'Save the changes',
  'admin.boxScore.tracked.saved': 'Saved. These plays were added to the game’s list of plays:',
  'admin.boxScore.tracked.title': 'Edit box score: {away} at {home}',
  'admin.boxScore.tracked.view': 'See the box score as it was tracked',
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
  'admin.games.callOff.ask.forfeitOffline':
    'If someone is scoring this game on a device with no signal, their plays will not be saved.',
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
  'admin.games.callOff.yes.postpone': 'Yes, postpone it, decide the new date later',
  'admin.games.callOff.yes.restore': 'Yes, put it back on its date',
  // Postponing offers the new date at once (S-49): to the game's "Give it a new date".
  'admin.games.callOff.yesNewDate.postpone': 'Yes, postpone it and give it a new date now',
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
  'admin.games.error.season-archived':
    "This game's season is archived, so it is read-only. Nothing was changed. Only a correction with a reason changes it.",
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
  // "Later games" (step 2.56): every scheduled game after this week, by team or all.
  'admin.games.later.all': 'All teams',
  'admin.games.later.choose': 'Choose a team',
  'admin.games.later.empty': 'There are no games after this week.',
  'admin.games.later.filters': 'Later games',
  'admin.games.later.more': 'Only the first {count} games are shown.',
  'admin.games.later.note':
    'Every game still to come after this week, soonest first, to forfeit, postpone or cancel one further ahead.',
  'admin.games.later.pick': 'Choose a team, or all teams, to see the games after this week.',
  'admin.games.later.show': 'Show',
  'admin.games.later.shown': 'Games of {team}',
  'admin.games.later.shownAll': 'Every game after this week',
  'admin.games.later.team': 'Team',
  'admin.games.later.title': 'Later games',
  // Step 2.56: a game whose line-ups are set in the tracker, with no plays here yet: a
  // game started on a device with no signal looks the same, so this says only what is known.
  'admin.games.lineupsSet':
    'Line-ups are set in the tracker, but no plays have reached us from it yet.',
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
  // Step 2.56 (S-86): a typed final score says whether the game went to overtime.
  'admin.games.overtime': 'Overtime',
  // For translators: "_one" has no {count}.
  'admin.games.overtimeCount_one': 'One overtime',
  'admin.games.overtimeCount_other': '{count} overtimes',
  'admin.games.overtimeNone': 'No overtime',
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
  // A team in the bin, named on the games list (step 2.56).
  'admin.games.removedTeam': '{name} (removed)',
  'admin.games.reopenUntil':
    'You ended this game in the tracker, so you can reopen it until {time}.',
  'admin.games.reopenUntilOwn': 'You recorded this result, so you can correct it until {time}.',
  'admin.games.reopenWho.admins': 'Only a league admin or a scheduler can reopen this game.',
  'admin.games.reopenWho.archived':
    "This game's season is archived. Only a league admin or a scheduler can reopen it, with a reason.",
  'admin.games.reopenWho.overturned':
    'This result was overturned. Take the overturn off in Standings and stats first.',
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
  'admin.games.toLater': 'Later games',
  'admin.games.toScorekeepers': 'Scorekeepers',
  'admin.games.toWaiting': 'Waiting for a new date',
  'admin.games.today': 'Today, {time}',
  'admin.games.todayEmpty': 'No more games today.',
  'admin.games.todayTitle': 'Today',
  'admin.games.tomorrow': 'Tomorrow',
  // A game the live tracker has recorded plays of is ended there (S-46).
  'admin.games.tracked':
    'Plays are being recorded for this game in the tracker, so it is ended there, not by typing a score.',
  // Postponed games, each until it is given a new date (P7 §4 "Also", step 2.158); each
  // is given one here (step 2.53).
  'admin.games.waiting.empty': 'No game is waiting for a new date.',
  'admin.games.waiting.link': 'See the games waiting for a new date',
  'admin.games.waiting.note':
    'Postponed games, oldest first. Give each a new date here; it waits here until the schedule with its new date is published.',
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
