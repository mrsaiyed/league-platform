// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The tracker when it refuses, is read-only, is not started or reopens.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enTrackerStates = {
  // Marking a game not started (step 2.121, S-40): the Al-Hadi tracker's question
  // (checklist J5), the reason asked for once a basket, foul or turnover stands, and
  // each refusal of POST …/not-started by its code (NotStartedReply). Step 2.37 draws them.
  'tracker.notStarted.button': 'Mark not started',
  'tracker.notStarted.done': 'The game is scheduled again. Nothing recorded in it counts.',
  'tracker.notStarted.no': 'Keep scoring',
  'tracker.notStarted.question': 'Mark this game as not started?',
  'tracker.notStarted.questionDetail':
    'Its score and every stat recorded for it are cleared, here and on the live page. It shows as scheduled again.',
  'tracker.notStarted.reason': 'Why it needs clearing (kept in the log, never shown publicly)',
  'tracker.notStarted.reasons.onlyTrying': 'Only trying the tracker',
  'tracker.notStarted.reasons.other': 'Another reason',
  'tracker.notStarted.reasons.startedByMistake': 'Started by mistake',
  'tracker.notStarted.reasons.wrongFormat': 'Wrong game format',
  'tracker.notStarted.reasons.wrongGame': 'Wrong game',
  'tracker.notStarted.refused.changed-since-read':
    'Plays were saved for this game since this screen loaded them. Look again before you clear it.',
  'tracker.notStarted.refused.entered-by-hand':
    'This game’s result was entered by hand, not scored live. Reopen it to change it.',
  'tracker.notStarted.refused.game-cancelled':
    'This game is cancelled, so there is nothing to clear.',
  'tracker.notStarted.refused.game-final':
    'This game is final. Reopen it to change it; it cannot be marked not started.',
  'tracker.notStarted.refused.game-not-started':
    'This game has not started, so there is nothing to clear.',
  'tracker.notStarted.refused.game-postponed':
    'This game is postponed, so there is nothing to clear.',
  'tracker.notStarted.refused.not-allowed':
    'You do not have access to score this game, so you cannot mark it not started.',
  'tracker.notStarted.refused.not-tracked':
    'This game has no plays from the tracker, so there is nothing to clear.',
  'tracker.notStarted.refused.plays-recorded':
    'A basket, foul or turnover is recorded. Undo them first, then mark the game not started; or a league admin can clear it with a reason.',
  'tracker.notStarted.refused.reason-needed':
    'A basket, foul or turnover is recorded in this game. Say why it needs clearing.',
  'tracker.notStarted.refused.session-held':
    'Someone else has been scoring this game on another device, and may still be scoring it without a connection. Take the game over first, then try again.',
  'tracker.notStarted.refused.unknown-game': 'This game could not be found.',
  'tracker.notStarted.refused.was-decided':
    'This game was final once, so it was played and cannot be marked not started. Correct its plays instead.',
  'tracker.notStarted.yes': 'Yes, mark not started',
  'tracker.readOnly.expired':
    'This device was away too long and another device has had the game since. This one is now read-only.',
  'tracker.readOnly.game-not-live':
    'This game cannot be scored now: it is over, cancelled or postponed.',
  'tracker.readOnly.not-allowed': 'You do not have access to score this game.',
  'tracker.readOnly.not-held': 'This device is no longer the one scoring this game.',
  'tracker.readOnly.released':
    'This device has left the game. It is read-only until you open it again.',
  'tracker.readOnly.request-refused':
    'Something went wrong opening the game. Tap Open the game again.',
  'tracker.readOnly.signed-in-as-other':
    'You signed in again, but this game is no longer being scored on this device: someone else is signed in here now, or another device took the game over while you were signed out. This one is now read-only.',
  'tracker.readOnly.signed-out':
    'You are signed out. Sign in again to keep scoring. What you entered on this device is kept and sent once you are back, so do not enter it again.',
  'tracker.readOnly.storage-failed':
    'This device could not read what it has saved, so it is read-only. Open the game again to try once more.',
  // What the tracker says about holding the game and refused taps (T6 §5, T-113),
  // chosen from the controller's status by apps/web/src/features/tracker/tracker-notice.ts.
  'tracker.readOnly.taken-over':
    'Someone else is now scoring this game on another device. This device can no longer score it.',
  'tracker.readOnly.unknown-game': 'This game could not be found.',
  'tracker.readOnly.update-needed':
    'This tracker needs an update. Reload the page to keep scoring.',
  'tracker.refusal.alreadyRunningClock': 'The clock already runs through fouls.',
  'tracker.refusal.alreadyStopClock': 'The clock already stops on fouls.',
  'tracker.refusal.alreadyThatPeriod': 'The game is already in that period.',
  'tracker.refusal.badPoints': 'A basket is 1, 2 or 3 points.',
  'tracker.refusal.badTimeout': 'A timeout is 60 or 30 seconds.',
  'tracker.refusal.clockNotRunning': 'The clock is not running.',
  'tracker.refusal.clockRange': 'Set the clock between 0:00 and 60:00.',
  'tracker.refusal.clockRunning': 'The clock is already running.',
  'tracker.refusal.formatFixed':
    'The format is fixed once the game is under way. Mark the game not started to change it.',
  // What the game's rules refuse, in the tracker's words (finding M3 of the 2.107 audit):
  // one sentence for each refusal of the engine (packages/sports/src/basketball/live.ts),
  // matched by apps/web/src/features/tracker/engine-words.ts. A test fails when the
  // engine gains a refusal with no sentence here.
  'tracker.refusal.gameFinal': 'This game is final. Reopen it to make changes.',
  'tracker.refusal.lineupAlreadySet':
    'This team already has players on the court. Use substitutions.',
  'tracker.refusal.lineupRepeats': 'Pick each player once.',
  'tracker.refusal.lineupSize': 'Pick 1 to {size} players.',
  'tracker.refusal.noFoulToTakeBack': 'That player has no foul to take back.',
  'tracker.refusal.noTeamTurnoverToTakeBack': 'There is no team turnover to take back.',
  'tracker.refusal.noTimeoutToTakeBack': 'There is no timeout to take back.',
  'tracker.refusal.noTurnoverToTakeBack': 'That player has no turnover to take back.',
  'tracker.refusal.notFinal': 'Only a final game can be reopened.',
  'tracker.refusal.nothingRecorded': 'Nothing is recorded for this game yet.',
  'tracker.refusal.nothingToRedo': 'There is nothing to redo.',
  'tracker.refusal.nothingToUndo': 'There is nothing to undo.',
  'tracker.refusal.other': 'The game’s rules do not allow that.',
  'tracker.refusal.periodOver': 'This period is over. Pick the next period first.',
  'tracker.refusal.pickClockMode': 'Pick a stop clock or a running clock.',
  'tracker.refusal.pickPeriod': 'Pick a period.',
  'tracker.refusal.pickPlayer': 'Pick a player.',
  'tracker.refusal.rules.bonus': 'The bonus starts between 1 and 30 team fouls.',
  'tracker.refusal.rules.doubleBonus': 'The double bonus must come after the bonus.',
  'tracker.refusal.rules.foulLimit': 'A player fouls out after 1 to 20 fouls, or never.',
  'tracker.refusal.rules.lastMinutesLength':
    'The last-minutes stop clock runs 1 second to 10 minutes, and no longer than a period.',
  'tracker.refusal.rules.lastMinutesScope':
    'The last-minutes stop clock is at the end of each period, each half or the game.',
  'tracker.refusal.rules.mercyLead': 'The mercy rule starts at a lead of 1 to 100 points.',
  'tracker.refusal.rules.overtimeLength': 'Overtime runs 1 to 30 minutes.',
  'tracker.refusal.rules.overtimeTimeouts': 'Allow 0 to 5 timeouts each overtime.',
  'tracker.refusal.rules.periodLength': 'A period runs 1 to 60 minutes.',
  'tracker.refusal.rules.periods': 'Play halves or quarters.',
  'tracker.refusal.rules.timeoutCount': 'Allow 0 to 10 timeouts of each length.',
  'tracker.refusal.rules.timeoutsCarry': 'Say whether unused timeouts carry over.',
  'tracker.refusal.rules.timeoutsPer': 'Timeouts are per game or per half.',
  'tracker.refusal.subInOnCourt': 'That player is already on the court.',
  'tracker.refusal.subNeedsBoth': 'Pick who comes on and who comes off.',
  'tracker.refusal.subOutNotOnCourt': 'The player coming off is not on the court.',
  'tracker.refusal.unknownAction': 'This version of the tracker does not know that action.',
  'tracker.refusal.unknownTeam': 'That team is not in this game.',
  'tracker.reopen.adminCan': 'A league admin can reopen this game.',
  // Reopen game on the tracker's final panel (step 2.37 draws it), from the server's
  // answer to GET …/games/{game}/reopen before the tap (step 2.120, S-36).
  'tracker.reopen.button': 'Reopen game',
  'tracker.reopen.cancel': 'Keep it final',
  'tracker.reopen.confirm': 'Reopen the game',
  'tracker.reopen.done': 'The game is live again. Carry on scoring.',
  'tracker.reopen.noConnection':
    'No connection. The game reopens as soon as the connection is back.',
  'tracker.reopen.question':
    'Reopen this game? It goes back to live with every play as it was, and it stops counting in the standings until you end it again.',
  'tracker.reopen.reasonLabel':
    'Why it is being reopened (kept in the game’s corrections, never shown publicly)',
  'tracker.reopen.reasonReady': 'End game tapped by mistake',
  'tracker.reopen.until': 'You can reopen this game until {time}.',
} as const;
