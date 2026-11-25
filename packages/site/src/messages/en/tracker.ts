// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The tracker.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enTracker = {
  'tracker.app.name': 'Courtside scoring',
  'tracker.app.shortName': 'Scoring',
  'tracker.back': 'Back to your games',
  'tracker.bench.comesInFor': 'Who comes in for {player}?',
  'tracker.bench.everyoneOn': 'Everyone is on the court.',
  'tracker.bench.more_one': '{count} more',
  'tracker.bench.more_other': '{count} more',
  'tracker.bench.of': '{team} bench',
  'tracker.bench.open': 'Bench {count}',
  'tracker.bench.showAll': 'Show all of the {team} bench',
  'tracker.bench.title': 'Bench',
  'tracker.bonus.1': 'Bonus',
  // In a box too narrow for both words (a phone whose letters are wide) the badge shows
  // the first word only, at the same size: the word that tells the two badges apart
  // comes first.
  'tracker.bonus.2': 'Double bonus',
  // Signed in, and this account can no longer open the game (T-456): the plays are kept.
  'tracker.cannotOpenKept_one':
    'This account can no longer open this game. {count} play not yet saved is kept on this device. Save a copy and give it to the league’s admin, so it can be added.',
  'tracker.cannotOpenKept_other':
    'This account can no longer open this game. {count} plays not yet saved are kept on this device. Save a copy and give it to the league’s admin, so they can be added.',
  // Beside the period while the last-minutes stop clock holds (step 2.69): one short word,
  // so the scoreboard is no taller; a screen reader is told the label.
  'tracker.clock.lastMinutes': 'Stop clock',
  'tracker.clock.lastMinutesLabel': 'The last minutes: the clock stops on every foul.',
  'tracker.clock.over': 'Period over',
  'tracker.clock.overLabel': 'Period over: pick the next period',
  'tracker.clock.pause': 'Pause',
  'tracker.clock.pauseLabel': 'Pause the clock',
  'tracker.clock.set': 'Set the clock or change the period',
  // The clock, periods, team fouls and timeouts (step 2.36; DESIGN.md section 7).
  // Start and Pause differ in word and in shape; at 0:00 the button says why it is greyed.
  'tracker.clock.start': 'Start',
  'tracker.clock.startLabel': 'Start the clock',
  // The running-clock switch in the clock's form (step 2.69; S-21): on or off at any
  // moment, whatever the season's rule says. A timeout stops the clock either way.
  'tracker.clockMode.helpLastMinutes':
    'These are the last minutes, so the clock stops on every foul. Turn it on to keep the clock going.',
  'tracker.clockMode.helpRunning': 'The clock keeps going after a foul.',
  'tracker.clockMode.helpStop': 'The clock stops on every foul.',
  'tracker.clockMode.label': 'Running clock',
  'tracker.clockMode.off': 'Off',
  'tracker.clockMode.on': 'On',
  // Turned On then Off inside the last minutes (S-124): a stop clock for the rest of the
  // game until step 2.252, said on the scoring screen while it holds.
  'tracker.clockMode.stopForGame':
    'The clock now stops on fouls for the rest of the game. Tap Running clock to change it back.',
  // What a time that takes time off the clock adds to the minutes (S-71): it was played
  // with the clock stopped. The engine's own figure, "4:55" for 16:55 set to 12:00.
  'tracker.clockSheet.adds': 'This adds {time} to the minutes of the players on the court.',
  'tracker.clockSheet.backLabel': 'Delete the last digit',
  'tracker.clockSheet.clear': 'Clear',
  'tracker.clockSheet.clearLabel': 'Clear the time typed',
  'tracker.clockSheet.keys': 'Number keys',
  'tracker.clockSheet.keysHelp': 'Type the time left: 6, 3, 0 is 6:30.',
  'tracker.clockSheet.next': 'next',
  'tracker.clockSheet.now': 'now',
  'tracker.clockSheet.period': 'Period',
  'tracker.clockSheet.periodGo': 'Go to {period}',
  'tracker.clockSheet.periodHelp':
    'Picking a period stops the clock and sets it to that period’s length.',
  'tracker.clockSheet.periodNow': '{period}, the period being played',
  // What a time that puts time back on the clock takes off the minutes: the engine's own
  // figure, which is never more than the period being played has run. The second says
  // that it is all of it (a time put back above where the period started; or, in a game
  // saved before minutes followed the game clock, a clock set lower and put right).
  'tracker.clockSheet.putsBack': 'This takes {back} off the minutes of the players on the court.',
  'tracker.clockSheet.putsBackAll':
    'This takes {back} off the players’ minutes: all they have played this period.',
  'tracker.clockSheet.range': 'The clock goes up to 60:00.',
  'tracker.clockSheet.seconds': 'Seconds go up to 59.',
  'tracker.clockSheet.set': 'Set clock',
  'tracker.clockSheet.setTo': 'Set clock to {clock}',
  // Before the clock has run in a period, a set only says where the period starts.
  'tracker.clockSheet.startsAt': 'The period will start at {clock}. Nobody’s minutes change.',
  'tracker.clockSheet.stops': 'Setting the clock stops it.',
  // A set that takes back an earlier change to this period's clock (S-71 as changed on
  // November 17): those minutes return to the players they came from. Then, if anything
  // is left over, the new correction ({more}).
  'tracker.clockSheet.takesBack':
    'This takes back {time} of an earlier change to this period’s clock. Minutes and play times go back as they were.',
  'tracker.clockSheet.takesBackAdds':
    'This takes back {time} of an earlier change to this period’s clock. Minutes and play times go back as they were. This adds {more} to the minutes of the players on the court.',
  'tracker.clockSheet.takesBackPutsBack':
    'This takes back {time} of an earlier change to this period’s clock. Minutes and play times go back as they were. This takes {more} off the minutes of the players on the court.',
  'tracker.clockSheet.time': 'Time left',
  // The form that sets the clock and picks the period.
  'tracker.clockSheet.title': 'Clock and period',
  // A time longer than the period being played: "H1 is 20:00 long: type 20:00 or less."
  'tracker.clockSheet.tooLong': '{period} is {length} long: type {length} or less.',
  // "Save a copy" behind More (S-5, T-129, step 2.70): what the copy is for.
  'tracker.copy.explain':
    'Saves a file on this device with the plays not yet on the server. If this device cannot get back online, open the file on another phone or computer to upload it. Nothing is counted twice.',
  'tracker.copy.failed':
    'The copy could not be saved: this device’s storage did not answer. Try again.',
  // Why an uploaded file was not taken (step 2.70): the upload page words these.
  'tracker.copy.refused.damaged':
    'This copy is damaged: it was cut short or changed. Save a new copy on the scoring device if you can.',
  'tracker.copy.refused.game-not-live': 'This game is postponed: it cannot be scored now.',
  'tracker.copy.refused.not-a-copy':
    'This file is not a copy of a game. Pick the file saved by “Save a copy”.',
  'tracker.copy.refused.not-allowed': 'You may not score this game, so you cannot upload its copy.',
  'tracker.copy.refused.other-game':
    'This copy is of another game. Open that game’s upload page instead.',
  'tracker.copy.refused.other-league': 'This copy is of a game in another league.',
  'tracker.copy.refused.reopen-first':
    'This game has ended. Reopen it first, then upload the copy again.',
  'tracker.copy.refused.season-archived':
    'This game’s season is archived: only an admin correcting it can upload its copy.',
  'tracker.copy.refused.unknown-game': 'There is no such game.',
  'tracker.copy.refused.unknown-version':
    'This copy was saved by a newer version of the tracker. Reload this page and try again.',
  'tracker.copy.save': 'Save a copy',
  'tracker.copy.savedNone':
    'Copy saved. Every play is already on the server, so it holds nothing to upload.',
  'tracker.copy.saved_one':
    'Copy saved on this device, with {count} play not yet on the server. Keep the file until the play is sent.',
  'tracker.copy.saved_other':
    'Copy saved on this device, with {count} plays not yet on the server. Keep the file until they are sent.',
  // After several minutes offline with plays waiting (T6 §4, T-129).
  'tracker.copy.suggest':
    'To be safe, save a copy of the game now: if this device cannot get back online, the copy can be uploaded from another phone or computer.',
  'tracker.copy.where':
    'Cannot get back online? Sign in on another phone or computer and upload the copy there:',
  'tracker.court.close': 'Close',
  'tracker.court.controls': 'Clock and undo',
  'tracker.court.more': 'More',
  'tracker.court.moreTitle': 'More for this game',
  'tracker.court.pad': 'Scoring pad',
  'tracker.court.plays': 'Plays',
  // The scoring screen (step 2.35; docs/build/DESIGN.md section 7): its frame, the
  // lineups, the players' tiles and the pad, substitutions, turnovers and swap colors.
  'tracker.court.scoreboard': 'Scoreboard',
  'tracker.court.swapColors': 'Swap colors',
  'tracker.court.swapColorsHelp':
    'Swaps which team is drawn light and which dark. It is saved with the game.',
  'tracker.court.teamBoard': '{team}: {score}, {fouls}',
  'tracker.court.teamBoardBonus': '{team}: {score}, {fouls}, shooting the {bonus}',
  'tracker.court.teamScore': '{team}: {score}',
  'tracker.court.watch': 'Open the public game page',
  'tracker.court.watchHelp': 'Opens in a new tab. This screen stays open.',
  // End game (step 2.37; checklist J1 to J3): the question says the score and what ending
  // does, and, when the game is ended early, that time is still on the clock and in which
  // period. The device is told whether the season allows ties (S-73): at a level score
  // the question says the game ends as a tie, or End game is refused at once in words
  // that say to play overtime.
  'tracker.end.ask.does':
    'This becomes the final score and goes into the standings. A game ended by mistake can be reopened.',
  'tracker.end.ask.level': 'The score is level, so the game ends as a tie.',
  'tracker.end.ask.notLast': '{period} is over, and {next} has not been played.',
  'tracker.end.ask.timeLeft': '{period} still has {clock} on the clock.',
  'tracker.end.ask.title': 'End the game?',
  'tracker.end.button': 'End game',
  'tracker.end.ending': 'Ending…',
  'tracker.end.help': 'Makes the game final. You are asked first.',
  'tracker.end.keep': 'Keep playing',
  'tracker.end.level':
    'This season allows no ties, so a level game cannot end. Play overtime until a team is ahead.',
  // Level with time still to play (lane 2.37, fix round, F3): overtime is only for a
  // game still level once the last period has run out.
  'tracker.end.levelNotLast':
    'This season allows no ties, so a level game cannot end. {period} is over, and {next} is still to play.',
  'tracker.end.levelTimeLeft':
    'This season allows no ties, so a level game cannot end. {period} still has {clock} to play.',
  'tracker.end.levelTitle': 'The score is level',
  // In the pad when the last period's clock has run out with a team ahead: offered,
  // never done by itself (S-65).
  // "Take back End game" when the End was sent and its answer lost (lane 2.37, fix round,
  // F2): the league may have it, so it is kept, and the panel says so until it answers.
  'tracker.end.maybeSaved':
    'It was sent as the connection dropped, so the league may have it, and it cannot be taken back here. This says “Saved” once the league answers; then Reopen is the way back.',
  'tracker.end.offer':
    '{period} is over. {team} lead {high}–{low}: end the game once the score is right.',
  // The league did not take an End tap this device made (an older page, a rule changed
  // mid-game): the game is live again, and the pad says why.
  'tracker.end.refused': 'The league did not take End game: {why}',
  'tracker.end.refusedLevel':
    'The league did not take End game: the score is level and this season allows no ties. Play overtime until a team is ahead.',
  'tracker.end.refusedTitle': 'The game is still live',
  'tracker.end.savedMeanwhile':
    'The league already has the end of this game, so it cannot be taken back here. Reopen it instead.',
  'tracker.end.takeBack': 'Take back End game',
  'tracker.end.takeBackFailed': 'This device could not take End game back. Try again.',
  'tracker.end.takenBack': 'End game taken back. The game is live; the clock is stopped.',
  // The final panel, in the pad's place once the game is ended (checklist J4).
  'tracker.final.back': 'Back to the games',
  'tracker.final.checking': 'Checking whether this game can be reopened here…',
  'tracker.final.checkingSaved': 'Checking whether the result was saved…',
  // What a tile, a team's turnovers or its bench says when tapped on a final game (D12)
  // is `tracker.refusal.gameFinal`. The panel's own name, for a screen reader:
  'tracker.final.label': 'The game is final',
  'tracker.final.notSent':
    'The league gets the result once the connection is back. Until then End game can be taken back here.',
  'tracker.final.notSentLead': 'Not sent yet.',
  'tracker.final.reopenAlways': 'You can reopen it at any time.',
  'tracker.final.reopenLeft_one': 'You can reopen it for {count} more minute.',
  'tracker.final.reopenLeft_other': 'You can reopen it for {count} more minutes.',
  'tracker.final.saved': 'Saved. It counts in the standings.',
  'tracker.final.score': '{home} {homeScore}, {away} {awayScore}',
  'tracker.final.sending': 'Sending the result to the league…',
  'tracker.final.tied': 'A tie, {high}–{low}',
  'tracker.final.title': 'Final',
  'tracker.final.won': '{team} won, {high}–{low}',
  'tracker.floor.title': 'On court',
  'tracker.format.archived': "This game's season is archived, so its game rules cannot be changed.",
  'tracker.format.clock.running': 'Running clock: the clock keeps going through fouls and timeouts',
  'tracker.format.clock.stop': 'Stop clock: fouls and timeouts stop the clock',
  'tracker.format.confirm': 'Confirm and start scoring',
  'tracker.format.halves': '2 halves of {minutes} minutes',
  'tracker.format.intro': 'This game is set up to be played like this. Check it before you start.',
  'tracker.format.overtime': 'Overtime periods of {minutes} minutes',
  'tracker.format.quarters': '4 quarters of {minutes} minutes',
  'tracker.format.title': 'Check the game format',
  'tracker.format.wrong':
    'If this is not how the game is being played, ask a league admin to change the game format before you start.',
  // One game's own format (step 2.119; P7 §5.1, S-35, S-39): the rules listed at the start
  // confirmation, the form that changes them for this game only, and the line said back.
  // The admin's games area uses the same words.
  'tracker.formatChange.button': 'Change the format',
  'tracker.formatChange.cancel': 'Cancel',
  'tracker.formatChange.changedElsewhere':
    'The format of this game was changed. Check it and confirm again.',
  'tracker.formatChange.closeFirst': 'Save or close the format form first.',
  'tracker.formatChange.fact.bonus': 'Bonus from team foul {count}',
  'tracker.formatChange.fact.carry.no': 'Unused timeouts do not carry over',
  'tracker.formatChange.fact.carry.yes': 'Unused timeouts carry over',
  'tracker.formatChange.fact.double': 'Double bonus from team foul {count}',
  'tracker.formatChange.fact.double.none': 'No double bonus',
  'tracker.formatChange.fact.fouled': 'A player is out at {count} fouls',
  'tracker.formatChange.fact.fouled.none': 'No foul limit for players',
  'tracker.formatChange.fact.full': 'Full timeouts: {count}',
  'tracker.formatChange.fact.halves': '2 halves',
  'tracker.formatChange.fact.length': '{minutes} minutes each',
  'tracker.formatChange.fact.mercy': 'A lead of {count} points switches to a running clock',
  'tracker.formatChange.fact.mercy.none': 'No mercy rule',
  'tracker.formatChange.fact.overtimeouts': 'Timeouts in each overtime: {count}',
  'tracker.formatChange.fact.quarters': '4 quarters',
  'tracker.formatChange.fact.reset.game': 'Team fouls count for the whole game',
  'tracker.formatChange.fact.reset.half': 'Team fouls start again each half',
  'tracker.formatChange.fact.reset.period': 'Team fouls start again each period',
  'tracker.formatChange.fact.scope.game': 'Those last seconds are at the end of the game',
  'tracker.formatChange.fact.scope.half': 'Those last seconds are at the end of each half',
  'tracker.formatChange.fact.scope.period': 'Those last seconds are at the end of each period',
  'tracker.formatChange.fact.short': 'Short timeouts: {count}',
  'tracker.formatChange.fact.stop': 'The clock stops by itself in the last {count} seconds',
  'tracker.formatChange.fact.stop.none': 'No stop clock at the end',
  'tracker.formatChange.fact.timeouts.game': 'Timeouts are counted for the whole game',
  'tracker.formatChange.fact.timeouts.half': 'Timeouts are counted each half',
  'tracker.formatChange.field.bonus': 'Bonus from team foul',
  'tracker.formatChange.field.carry': 'Unused timeouts carry over',
  'tracker.formatChange.field.clock': 'Clock',
  'tracker.formatChange.field.double': 'Double bonus from team foul (empty for none)',
  'tracker.formatChange.field.fouled': 'A player is out at this many fouls (empty for no limit)',
  'tracker.formatChange.field.full': 'Full timeouts',
  'tracker.formatChange.field.length': 'Minutes in each period',
  'tracker.formatChange.field.mercy': 'A lead that switches to a running clock (empty for none)',
  'tracker.formatChange.field.overtime': 'Minutes in each overtime',
  'tracker.formatChange.field.overtimeouts': 'Timeouts in each overtime',
  'tracker.formatChange.field.periods': 'Periods',
  'tracker.formatChange.field.reset': 'Team fouls start again',
  'tracker.formatChange.field.scope': 'Where those last seconds are',
  'tracker.formatChange.field.short': 'Short timeouts',
  'tracker.formatChange.field.stop': 'Stop clock in the last seconds (empty for none)',
  'tracker.formatChange.field.timeouts': 'Timeouts are counted',
  'tracker.formatChange.finished': 'The game is finished: its format can no longer be changed.',
  'tracker.formatChange.invalid':
    'Some of these numbers do not fit together. Check them and save again.',
  'tracker.formatChange.offline': 'Not saved: there is no connection. Try again.',
  'tracker.formatChange.option.clock.running': 'Running clock',
  'tracker.formatChange.option.clock.stop': 'Stop clock',
  'tracker.formatChange.option.periods.halves': '2 halves',
  'tracker.formatChange.option.periods.quarters': '4 quarters',
  'tracker.formatChange.option.reset.game': 'Never: they count for the whole game',
  'tracker.formatChange.option.reset.half': 'Each half',
  'tracker.formatChange.option.reset.period': 'Each period',
  'tracker.formatChange.option.scope.game': 'At the end of the game',
  'tracker.formatChange.option.scope.half': 'At the end of each half',
  'tracker.formatChange.option.scope.period': 'At the end of each period',
  'tracker.formatChange.option.timeouts.game': 'For the whole game',
  'tracker.formatChange.option.timeouts.half': 'Each half',
  'tracker.formatChange.preset': 'Start from',
  'tracker.formatChange.preset.high-school': 'High school',
  'tracker.formatChange.preset.rec-league': 'Recreation league',
  'tracker.formatChange.preset.season': "The season's format",
  'tracker.formatChange.readFailed': 'The format could not be read.',
  'tracker.formatChange.reading': 'Reading the format…',
  'tracker.formatChange.refused.changed':
    'The game changed since this was read. Look at the format again and change it again.',
  'tracker.formatChange.refused.other': 'This format could not be saved.',
  'tracker.formatChange.refused.setting':
    "The league does not let scorekeepers change a game's format. Ask a league admin.",
  'tracker.formatChange.retry': 'Try again',
  'tracker.formatChange.save': 'Save for this game only',
  'tracker.formatChange.saved': 'Saved for this game only: {summary}.',
  'tracker.formatChange.saved.season': "This game follows the season's format again: {summary}.",
  'tracker.formatChange.season': "Use the season's format",
  'tracker.formatChange.source.finished': 'The game is finished. These were its rules.',
  'tracker.formatChange.source.fixed': 'Fixed when the game started.',
  'tracker.formatChange.source.given': 'This game has its own format.',
  'tracker.formatChange.source.season': "This game follows its season's format.",
  'tracker.formatChange.summary':
    '{periods} of {minutes} minutes, {clock}, bonus from team foul {bonus}',
  'tracker.formatChange.summary.running': 'running clock',
  'tracker.formatChange.summary.stop': 'stop clock',
  'tracker.formatChange.title': "This game's format",
  'tracker.formatChange.underway': 'The game is under way: its format can no longer be changed.',
  // The server's answer brought another format than the device was playing (T-344).
  'tracker.formatChangedTo': 'The format of this game was changed. It is now: {format}.',
  'tracker.formatChangedTo.dismiss': 'OK',
  // Team fouls this period (or this half, or this game, as the season counts them, step
  // 2.123), in each team's box of the scoreboard, and the bonus badge beside the team that
  // shoots it.
  'tracker.fouls.count_one': '{count} foul',
  'tracker.fouls.count_other': '{count} fouls',
  'tracker.fouls.thisGame_one': '{count} team foul this game',
  'tracker.fouls.thisGame_other': '{count} team fouls this game',
  'tracker.fouls.thisHalf_one': '{count} team foul this half',
  'tracker.fouls.thisHalf_other': '{count} team fouls this half',
  'tracker.fouls.thisPeriod_one': '{count} team foul this period',
  'tracker.fouls.thisPeriod_other': '{count} team fouls this period',
  'tracker.held.dismiss': 'Dismiss',
  'tracker.held.dismissFailed': 'This device could not dismiss them. Try again.',
  'tracker.held.dismissNotSaved_one':
    'Dismiss the play not saved? Its list is deleted from this device. The league never had it.',
  'tracker.held.dismissNotSaved_other':
    'Dismiss the {count} plays not saved? Their list is deleted from this device. The league never had them.',
  'tracker.held.dismissWaiting_one':
    'Dismiss {count} play that was never sent? It is deleted from this device and the league will never get it, unless someone enters it again.',
  'tracker.held.dismissWaiting_other':
    'Dismiss {count} plays that were never sent? They are deleted from this device and the league will never get them, unless someone enters them again.',
  'tracker.held.game': '{home} v {away}',
  'tracker.held.intro':
    'These games have plays on this device that the league does not have. Open a game to send them, or dismiss them.',
  'tracker.held.lastTap': 'Last play {when}',
  'tracker.held.notSaved_one': '{count} play not saved',
  'tracker.held.notSaved_other': '{count} plays not saved',
  'tracker.held.open': 'Open to send',
  'tracker.held.openToSee': 'Open to see',
  'tracker.held.someGame': 'A game scored on this device',
  'tracker.held.someGameAnyLeague':
    'A game scored on this device: it may belong to another league on this device',
  'tracker.held.title': 'Kept on this device',
  'tracker.held.waiting_one': '{count} play waiting to send',
  'tracker.held.waiting_other': '{count} plays waiting to send',
  'tracker.heldByOther': '{name} is scoring this game on another device.',
  'tracker.heldBySelf': 'You are scoring this game on another device.',
  'tracker.hint.players':
    'Tap a player, then +1, +2, +3, Foul or Turnover. −Foul takes back that player’s latest foul.',
  'tracker.hint.saved':
    'Every tap is kept on this device and sent to the league. The top line says when all is saved.',
  'tracker.hint.subs':
    'To substitute, tap one player and then the other, or drag a bench player onto the one coming off.',
  // Where the bench is not on the screen (a short phone): nothing to tap or drag there.
  'tracker.hint.subsFolded':
    'To substitute, tap the player coming off, then who comes in. “Bench” opens a team’s whole bench.',
  'tracker.hint.title': 'How to score',
  'tracker.hint.turnovers':
    'Tap a team’s turnovers to see each player’s, take one back, or add a team turnover.',
  // The "not saved" list play by play (step 2.37, part 2): a tap that is a play is said
  // as the play log says it; these are the others.
  'tracker.kept.colors': 'Colors swapped',
  'tracker.kept.end': 'End game',
  'tracker.kept.pause': 'Clock paused',
  'tracker.kept.players': 'A change to a team’s players',
  'tracker.kept.redo': 'Redo',
  'tracker.kept.setClock': 'Clock set to {clock}',
  'tracker.kept.start': 'Clock started',
  'tracker.kept.undo': 'Undo',
  // "Enter again" on a kept play (S-77): only while this device holds the game, a new
  // play now; elsewhere the list is for reading out to whoever holds it.
  'tracker.keptList.again': 'Enter again',
  'tracker.keptList.againLabel': 'Enter again: {play}',
  'tracker.keptList.againNotTakenOff':
    'That play was entered again, but it could not be taken off this list. Tapping Enter again once more will not enter it twice.',
  'tracker.keptList.againRefused':
    'That play was not entered again: the game as it stands now does not take it. Enter it by hand if it is still needed.',
  // Cleared only by this deliberate tap: the scorekeeper has seen the list.
  'tracker.keptList.clear': 'I have seen these: clear the list',
  'tracker.keptList.readAloud':
    'Only the device scoring the game can enter these again. Read them out to whoever is scoring it now.',
  'tracker.keptList.title': 'Not saved',
  // When the device holding the game was last heard from (S-42), on the server's clock.
  'tracker.lastHeardNow': 'That device was last heard from less than a minute ago.',
  'tracker.lastHeard_one': 'That device was last heard from {count} minute ago.',
  'tracker.lastHeard_other': 'That device was last heard from {count} minutes ago.',
  // On the page that replaces the scoring screen when the device stops scoring (taken
  // over, signed out, no longer allowed) in the very moment a tap was made.
  'tracker.lastTapNotRecorded':
    'Your last tap was made as this device stopped scoring, so it was not recorded. Enter it again once the game is being scored.',
  // A way off the scoring screen tapped while plays wait (lane 2.37, fix round, F1): what
  // waits is sent only from this screen, so the screen asks first.
  'tracker.leave.anyway': 'Leave anyway',
  'tracker.leave.kept':
    'If you leave, it stays on this device and is sent only when this game’s scoring screen is opened on it again.',
  'tracker.leave.plays_one':
    '{count} play is not sent yet. Stay on this screen until it says “Saved”.',
  'tracker.leave.plays_other':
    '{count} plays are not sent yet. Stay on this screen until it says “Saved”.',
  'tracker.leave.result': 'The result is not sent yet. Stay on this screen until it says “Saved”.',
  'tracker.leave.stay': 'Stay here',
  'tracker.leave.title': 'Not sent yet',
  'tracker.lineup.noPlayers': 'No {team} players yet.',
  'tracker.lineup.pick': 'Pick the starting {size}: tap players below.',
  'tracker.lineup.picked': '{count} of {size} picked.',
  'tracker.lineup.startWith': 'Start with {count}',
  // The play log (step 2.37; checklist I4): every play, newest first, with its period
  // and game clock. A play the league does not have yet is dimmed and says so.
  'tracker.log.close': 'Close the play log',
  'tracker.log.count_one': '{count} play',
  'tracker.log.count_other': '{count} plays',
  'tracker.log.empty': 'No plays yet.',
  // The pad's line at rest: the latest play, which is the one Undo takes back, and the
  // way to all of them.
  'tracker.log.latest': 'Latest',
  'tracker.log.notSent': 'Not sent yet',
  'tracker.log.open': 'Open the play log: {count}',
  'tracker.log.row': '{period} {clock}',
  'tracker.log.score': '{home}–{away}',
  'tracker.log.title': 'Play log',
  'tracker.log.unsent_one': '{count} not sent yet',
  'tracker.log.unsent_other': '{count} not sent yet',
  // Under the newest plays, where a panel shows only those: the way to every play.
  'tracker.log.whole': 'See all {count} plays',
  'tracker.mark.off': 'Off',
  // On a tile for a moment, for the two players of a substitution.
  'tracker.mark.on': 'On',
  'tracker.matchup': '{away} at {home}',
  // The mercy rule switched the clock to running (step 2.69): said with the way back.
  'tracker.mercy.back': 'Stop the clock on fouls again',
  'tracker.mercy.keep': 'Keep it running',
  'tracker.mercy.said':
    'One team leads by {lead} or more, so the clock now keeps running after fouls (the mercy rule).',
  // Inside the last minutes (step 2.248): the stop clock holds there, so no way back.
  'tracker.mercy.saidLastMinutes':
    'One team leads by {lead} or more (the mercy rule), but in these last minutes the clock stops on every foul.',
  'tracker.mercy.seen': 'Got it',
  'tracker.noStorage':
    'This browser window cannot save the game on this device, so scoring is off. If this is a private window, open the tracker in a normal one.',
  // No longer allowed to score, with plays still on the device (finding M2).
  'tracker.notAllowedKept_one':
    'You are no longer allowed to score this game. {count} play is still on this device and is not saved. If an admin gives the game back to you, open it again here and it is sent.',
  'tracker.notAllowedKept_other':
    'You are no longer allowed to score this game. {count} plays are still on this device and are not saved. If an admin gives the game back to you, open it again here and they are sent.',
  // The plays the league refused, play by play, cleared only by a tap (step 2.37, part 2).
  'tracker.notAppliedList.clear': 'I have seen these: clear the list',
  'tracker.notAppliedList.title': 'Not applied',
  'tracker.notApplied_one': '{count} play was not applied. The game now shows what was saved.',
  'tracker.notApplied_other': '{count} plays were not applied. The game now shows what was saved.',
  'tracker.notAssigned':
    'You are not assigned to score this game. Ask a league admin to assign it to you.',
  'tracker.notLive.box-score':
    'This game is set to box score, so there is no live scoring. Enter its score in Games.',
  // The tracker's own refusals, each with the way back to the games (step 2.33).
  'tracker.notLive.final-score':
    'This game is set to final score only, so there is no live scoring. Enter its score in Games.',
  'tracker.notSaved_one':
    '{count} play on this device was not saved. Enter it again if it is needed.',
  'tracker.notSaved_other':
    '{count} plays on this device were not saved. Enter them again if they are needed.',
  // Several minutes with no connection and plays waiting (T6 §4, step 2.37 part 2).
  'tracker.offlineLong_one':
    'No connection for several minutes. {count} play is only on this device until the connection comes back. Keep this page open and the device switched on: it is sent by itself.',
  'tracker.offlineLong_other':
    'No connection for several minutes. {count} plays are only on this device until the connection comes back. Keep this page open and the device switched on: they are sent by themselves.',
  'tracker.openAgain': 'Open the game again',
  'tracker.opening': 'Opening the game…',
  'tracker.openingSlow': 'No answer yet. Check the connection; this keeps trying.',
  'tracker.over.halftime': 'Halftime. The clock starts again in the next period.',
  'tracker.over.period': 'End of {period}. The clock starts again in the next period.',
  'tracker.over.pick': 'Pick the next period',
  'tracker.pad.closeOptions': 'Close',
  'tracker.pad.foul': 'Foul',
  'tracker.pad.foulFor': 'Foul on {player}',
  'tracker.pad.inFor': 'In for',
  'tracker.pad.inForPlayer': '{in} in for {out}',
  'tracker.pad.optionsFor': 'Options for {player}',
  'tracker.pad.points': '+{points}',
  'tracker.pad.pointsLabel.1': 'Free throw',
  'tracker.pad.pointsLabel.2': '2 points',
  'tracker.pad.pointsLabel.3': '3 points',
  'tracker.pad.scoreFor': '{points} for {player}',
  'tracker.pad.subIn': 'Sub in',
  'tracker.pad.turnover': 'Turnover',
  'tracker.pad.turnoverFor': 'Turnover by {player}',
  'tracker.pad.unfoul': '−Foul',
  'tracker.pad.unfoulFor': 'Take back a foul from {player}',
  'tracker.pad.who.bench': 'Bench',
  'tracker.pad.who.floor': 'On court',
  'tracker.pad.who.fouls_one': '{count} foul',
  'tracker.pad.who.fouls_other': '{count} fouls',
  'tracker.pad.who.minutes': '{minutes} played',
  // The same where the line has no room for all of it (a narrow pad, a device whose
  // letters are wide): the long form begins with this one, and what follows it is left
  // off before anything is cut.
  'tracker.pad.who.minutesShort': '{minutes}',
  'tracker.pad.who.out': 'Fouled out',
  'tracker.pad.who.points': '{count} pts',
  'tracker.period.half': 'H{number}',
  'tracker.period.overtime': 'OT{number}',
  'tracker.period.quarter': 'Q{number}',
  'tracker.play.clock-mode.running': 'Running clock on',
  'tracker.play.clock-mode.stop': 'Stop clock on',
  'tracker.play.foul': 'Foul on {player}',
  'tracker.play.lineup': '{team} starters: {players}',
  'tracker.play.lineup.separator': ', ',
  'tracker.play.period': 'Start of {period}',
  // A play in the tracker's words, for the play log, Undo and the "not saved" lists
  // (finding M3): one for each kind of play the engine has, matched by engine-words.ts.
  'tracker.play.score': '{player} +{points}',
  // The same plays said shortest, for the Undo button under the scoreboard, where a
  // phone has room for a few words: what it was first, then who ("+2 #4 Jordan"), so
  // where the line is cut it is the name that is cut, never what happened or the number.
  // A turnover is the one long word among them: it is said after the player ("#4 Jordan
  // turnover"), since "Turnover #4…" lost the number in a phone's narrowest row.
  'tracker.play.short.clock-mode.running': 'Running clock',
  'tracker.play.short.clock-mode.stop': 'Stop clock',
  'tracker.play.short.foul': 'Foul {who}',
  'tracker.play.short.lineup': 'Starters {team}',
  'tracker.play.short.period': 'Start {period}',
  'tracker.play.short.score': '+{points} {who}',
  'tracker.play.short.sub': 'Sub {who}',
  'tracker.play.short.team-turnover': 'Team turnover',
  'tracker.play.short.team-unturnover': '−Team turnover',
  'tracker.play.short.timeout': 'Timeout {team}',
  'tracker.play.short.turnover': '{who} turnover',
  'tracker.play.short.unfoul': '−Foul {who}',
  'tracker.play.short.unscore': '−{points} {who}',
  'tracker.play.short.untimeout': '−Timeout {team}',
  'tracker.play.short.unturnover': '{who} −turnover',
  'tracker.play.sub': 'Sub: {in} in for {out}',
  'tracker.play.team-turnover': 'Team turnover: {team}',
  'tracker.play.team-unturnover': 'Team turnover taken back: {team}',
  'tracker.play.timeout.full': 'Full timeout: {team}',
  'tracker.play.timeout.short': '30-second timeout: {team}',
  'tracker.play.turnover': 'Turnover by {player}',
  'tracker.play.unfoul': 'Foul taken back: {player}',
  'tracker.play.unscore': 'Basket taken back: {player} +{points}',
  'tracker.play.untimeout': 'Timeout taken back: {team}',
  'tracker.play.unturnover': 'Turnover taken back: {player}',
  'tracker.player.fullName': '{first} {last}',
  'tracker.player.name': '{name}',
  'tracker.player.number': '#{jersey}',
  'tracker.player.numberName': '#{jersey} {name}',
  // A player the game has and this device's rosters do not (added at another table).
  'tracker.player.unknown': 'Player not on this device’s list',
  'tracker.player.unlistedShort': 'Not listed',
  // The Players panel (step 2.118, part 2): both teams' players, a line to add one player
  // or a bench by number, a fix of a number or a name, take off (S-34, S-44, S-45).
  'tracker.players.add': 'Add',
  'tracker.players.addFirst': 'Add players',
  'tracker.players.added_one': '{count} player added.',
  'tracker.players.added_other': '{count} players added.',
  'tracker.players.clash': 'Same number as {players}.',
  'tracker.players.clashLine': 'The number being typed is this player’s too.',
  'tracker.players.clashTyped':
    '#{jersey} is already worn by {players}. They can still be added: an admin sorts it out after.',
  'tracker.players.count_one': '{count} player',
  'tracker.players.count_other': '{count} players',
  'tracker.players.fix': 'Fix',
  'tracker.players.fixDone': 'Close',
  'tracker.players.invalid':
    'Use numbers from 0 to 99 (or 00). Type one number with a name, or several numbers with no name.',
  'tracker.players.jump': 'Go to the away team: {team}',
  'tracker.players.name': 'Name (if known)',
  'tracker.players.notANumber':
    '“{entry}” is not a jersey number. Use numbers from 0 to 99 (or 00).',
  'tracker.players.number': 'Number',
  'tracker.players.numbers': 'Number, or several numbers',
  'tracker.players.numbersHelp': 'For a whole bench, type the numbers in one line: 3 5 10 12 14.',
  'tracker.players.numbersWithName':
    'Several numbers and a name do not go together. Type the numbers alone for a bench, or one number with the name.',
  'tracker.players.open': 'Players',
  'tracker.players.openHelp': 'Add a player for either team, or fix a number or a name.',
  // The Players panel (step 2.118): why the panel takes no change now, and why a change
  // of players was said no to, by the device or the server (record 058, S-37, S-45).
  'tracker.players.readOnly.device':
    'This device is not scoring the game, so players cannot be changed here.',
  'tracker.players.readOnly.final': 'This game is over, so its players cannot be changed here.',
  'tracker.players.refused.game-over': 'This game is over, so its players cannot be changed here.',
  'tracker.players.refused.has-lines':
    'This player has a line in another game, so they stay on the team.',
  'tracker.players.refused.has-plays':
    'This player has plays in this game, so they stay on its list and its box score.',
  'tracker.players.refused.in-box-score':
    'This player has a line in this game’s box score, entered by hand, so they stay on its list.',
  'tracker.players.refused.jersey-taken':
    'Another player on this team wears that number, and this season wants a different number for each player.',
  'tracker.players.refused.name-not-readable': 'That name is too long to keep.',
  'tracker.players.refused.needs-name-or-number': 'A player needs a number or a name.',
  'tracker.players.refused.not-on-team': 'That player is no longer on this team.',
  'tracker.players.refused.not-saved': 'This change could not be saved. Try it again.',
  'tracker.players.refused.on-team-roster':
    'This player is on the team’s own roster: a league admin changes their name or takes them off.',
  'tracker.players.refused.player-id-taken': 'This player could not be added. Add them again.',
  'tracker.players.refused.player-not-added':
    'This player was not added, so the plays that name them were not saved.',
  'tracker.players.refused.reviewed':
    'A league admin has checked this player: the admin changes their name or takes them off now.',
  'tracker.players.refusedPlays_one': '{count} play that names them was not saved.',
  'tracker.players.refusedPlays_other': '{count} plays that name them were not saved.',
  'tracker.players.save': 'Save',
  'tracker.players.saved': 'Saved on this device.',
  'tracker.players.takeOff': 'Take off the team',
  'tracker.players.takenOff': 'Taken off.',
  'tracker.players.title': 'Players',
  'tracker.players.twice': '{jersey} is typed twice in the line. Type each number once.',
  'tracker.players.waiting': 'Not sent yet',
  'tracker.players.wornBy': '{player} wears #{jersey}.',
  'tracker.pregame.players_one': '{team}: {count} player',
  'tracker.pregame.players_other': '{team}: {count} players',
  'tracker.pregame.title': 'Before tip-off',
  'tracker.pregame.todo':
    'Check both teams’ jersey numbers, tap each team’s starters, then start the clock.',
  // The tracker's saved banner (T6 §4), chosen from the queue's status by
  // apps/web/src/features/tracker/queue-banner.ts.
  'tracker.queue.allSaved': 'All saved',
  // Signed out or no longer allowed to score (step 2.37, part 2): nothing is on its way,
  // so the plays are kept, never "waiting to send".
  // Changes of players (the Players panel, step 2.118) are said as changes, not plays.
  'tracker.queue.keptChangesShort_one': '{count} change kept',
  'tracker.queue.keptChangesShort_other': '{count} changes kept',
  'tracker.queue.keptChanges_one': '{count} change of players kept on this device',
  'tracker.queue.keptChanges_other': '{count} changes of players kept on this device',
  'tracker.queue.keptShort_one': '{count} kept',
  'tracker.queue.keptShort_other': '{count} kept',
  'tracker.queue.kept_one': '{count} play kept on this device',
  'tracker.queue.kept_other': '{count} plays kept on this device',
  'tracker.queue.notSavedShort_one': '{count} not saved',
  'tracker.queue.notSavedShort_other': '{count} not saved',
  'tracker.queue.notSaved_one': '{count} play not saved',
  'tracker.queue.notSaved_other': '{count} plays not saved',
  // No connection (step 2.37): said whenever the device knows it has none, with or
  // without plays waiting, so the banner never says "All saved" with the network off.
  'tracker.queue.offline': 'No connection: plays are kept on this device',
  'tracker.queue.offlineShort': 'No connection',
  'tracker.queue.separator': ' · ',
  'tracker.queue.storageFailed': 'This device could not save to its storage',
  'tracker.queue.storageFailedShort': 'Storage failed',
  // The same lines said shorter, for a phone whose scoreboard has no room for the long
  // ones (lying down, where the banner sits beside the scores and takes its width from
  // the teams' names; upright in a browser, where a second line of it would push the
  // players under the pad). "All saved" is said the same.
  'tracker.queue.waitingChangesShort_one': '{count} change to send',
  'tracker.queue.waitingChangesShort_other': '{count} changes to send',
  'tracker.queue.waitingChanges_one': '{count} change of players waiting to send',
  'tracker.queue.waitingChanges_other': '{count} changes of players waiting to send',
  'tracker.queue.waitingShort_one': '{count} to send',
  'tracker.queue.waitingShort_other': '{count} to send',
  'tracker.queue.waiting_one': '{count} play waiting to send',
  'tracker.queue.waiting_other': '{count} plays waiting to send',
  // Redo, beside Undo. Its name for a screen reader says the play it brings back.
  'tracker.redo.button': 'Redo',
  'tracker.redo.done': 'Brought back: {play}.',
  'tracker.redo.label': 'Redo {play}',
  'tracker.redo.nothing': 'Redo: nothing to bring back',
  // The server's refusal of a play of a statistic the season does not keep (S-93, step
  // 2.241): the tracker lists it with this sentence, an older one included.
  'tracker.refused.notKept.other': 'This season does not keep this statistic.',
  'tracker.refused.notKept.turnovers': 'This season does not keep turnovers.',
  // Left the game (an upload of a copy let go of it, step 2.70) with plays this device
  // can still send by "Send these plays" (T-370).
  'tracker.releasedKept_one':
    'This device has left the game. {count} play made here is still waiting: it is not on the server yet. Send it with “Send these plays” below, then open the game again to keep scoring.',
  'tracker.releasedKept_other':
    'This device has left the game. {count} plays made here are still waiting: they are not on the server yet. Send them with “Send these plays” below, then open the game again to keep scoring.',
  // The bonus horn's sentence: a muted tablet is the normal case in a gym.
  'tracker.say.bonus.1': 'Bonus: {team}.',
  'tracker.say.bonus.2': 'Double bonus: {team}.',
  'tracker.say.clockSet': 'Clock set to {clock}.',
  // {time} is what was added to the minutes: the time taken off the clock (S-71).
  'tracker.say.clockSetAdded':
    'Clock set to {clock}. {time} was added to the minutes of the players on the court.',
  // The same said in one line, where a phone is short of room: "Clock 15:00 · 4:59 added".
  'tracker.say.clockSetAddedShort': 'Clock {clock} · {time} added',
  // {back} is what came off the minutes, which can be less than went back on the clock.
  'tracker.say.clockSetBack':
    'Clock set to {clock}. {back} came off the minutes of the players on the court.',
  // The same said in one line, where a phone is short of room: "Clock 15:00 · 4:59 off".
  'tracker.say.clockSetBackShort': 'Clock {clock} · {back} off',
  // The same as the clock form's takesBack sentences, once the set is done; the short form
  // is one line, where a phone is short of room.
  'tracker.say.clockSetTakesBack':
    'Clock set to {clock}. {time} of an earlier change to this period’s clock was taken back: minutes and play times are as they were.',
  'tracker.say.clockSetTakesBackAdded':
    'Clock set to {clock}. {time} of an earlier change to this period’s clock was taken back, and {more} was added to the minutes of the players on the court.',
  'tracker.say.clockSetTakesBackBack':
    'Clock set to {clock}. {time} of an earlier change to this period’s clock was taken back, and {more} came off the minutes of the players on the court.',
  'tracker.say.clockSetTakesBackShort': 'Clock {clock} · {time} taken back',
  'tracker.say.foulStopped': 'Foul on {player}. Clock stopped.',
  'tracker.say.halftime': 'Halftime.',
  'tracker.say.notScoring':
    'This device is not scoring the game right now, so that was not recorded.',
  'tracker.say.outRecorded': '{player} is out. The foul was recorded anyway.',
  'tracker.say.periodEnd': 'End of {period}.',
  'tracker.say.periodStart': 'Start of {period}. Clock set to {clock}.',
  'tracker.say.storage':
    'This device could not keep that tap, so it was not recorded. Tap it again.',
  'tracker.say.subAcrossTeams': 'Substitutions have to stay within one team.',
  'tracker.say.subBenchToFloor': 'Drag a bench player onto someone on the court.',
  'tracker.say.teamTurnover': 'Team turnover: {team}.',
  'tracker.say.timeout.full': 'Full timeout: {team}.',
  'tracker.say.timeout.fullStopped': 'Full timeout: {team}. Clock stopped.',
  'tracker.say.timeout.short': '30-second timeout: {team}.',
  'tracker.say.timeout.shortStopped': '30-second timeout: {team}. Clock stopped.',
  'tracker.say.turnover': 'Turnover: {player}.',
  'tracker.say.untimeout': 'Timeout taken back: {team}.',
  // Which one came back: its period and the time it was taken at.
  'tracker.say.untimeoutOf': 'Timeout taken back: {team}, {period} {clock}.',
  'tracker.seeWhoIsScoring': 'See who is scoring',
  // "Send these plays" (S-43): only by the scorekeeper's tap, and only while nothing was recorded since.
  // The device could not tell whose the commands since were (step 2.242, T-357).
  'tracker.sendNotSaved.cannotTell':
    'This device could not tell whether somebody else scored in this game since these plays were made, so it did not send them. A play is never counted twice.',
  'tracker.sendNotSaved.gameMoved':
    'These plays could not be sent: something was recorded in this game since they were made. Each one must be entered again on the device scoring the game.',
  'tracker.sendNotSaved.send': 'Send these plays',
  'tracker.sendNotSaved.sending': 'Sending…',
  'tracker.sharedDevice.link': 'Sign out on your account page',
  'tracker.sharedDevice.text': 'On a shared phone or tablet, sign out when you finish.',
  'tracker.signIn': 'Sign in',
  // Signed out while scoring (finding M2): scoring goes on, and nothing is sent until
  // the scorekeeper signs in again, so these never say "waiting to send".
  'tracker.signedOut':
    'You are signed out. Keep scoring: what you enter is kept on this device and sent once you sign in again.',
  'tracker.signedOutKept_one':
    'You are signed out. {count} play is being kept on this device and is sent once you sign in again.',
  'tracker.signedOutKept_other':
    'You are signed out. {count} plays are being kept on this device and are sent once you sign in again.',
  'tracker.start.hide': 'Hide the Start clock button',
  'tracker.start.reason.foul': 'Stopped for a foul on {player}.',
  'tracker.start.reason.periodStart': 'Start of {period}.',
  'tracker.start.reason.stopped': 'The clock is stopped.',
  'tracker.start.reason.timeout': 'Stopped for a {team} timeout.',
  'tracker.start.reason.tipOff': 'Start it at the tip.',
  'tracker.start.still': 'Scoring and substitutions still work. × hides this button.',
  'tracker.start.tipOff': 'Start clock · tip-off',
  // The large Start clock button in the pad, and why the clock is stopped.
  'tracker.start.title': 'Start clock',
  'tracker.start.when': '{period} · {clock}',
  'tracker.storeFailed':
    'This device could not keep its own copy of the game. Keep scoring: your plays are still saved. If the page reloads with no connection, the game may not open.',
  'tracker.takeOver': 'Take over scoring',
  'tracker.takeOverNo': 'Not now',
  'tracker.takeOverQuestion':
    'Take over scoring from {name}? Their device stops scoring. Plays it has not sent yet can be sent from it only until something is recorded here; after that they must be entered again.',
  // The same account on another device, told by the server's mark (S-42), never by names.
  'tracker.takeOverQuestionSelf':
    'Take over scoring from you, on another device? That device stops scoring. Plays it has not sent yet can be sent from it only until something is recorded here; after that they must be entered again.',
  'tracker.takeOverYes': 'Yes, take over',
  'tracker.team.dark': 'dark',
  'tracker.team.light': 'light',
  'tracker.tile.fouls': '{count}F',
  'tracker.tile.foulsCount_one': '{count} foul',
  'tracker.tile.foulsCount_other': '{count} fouls',
  'tracker.tile.label': '{player}, {where}, {points}, {fouls}',
  'tracker.tile.labelOut': '{label}, fouled out',
  'tracker.tile.noNumber': '–',
  'tracker.tile.out': 'Out',
  'tracker.tile.points': '{count} pts',
  'tracker.tile.pointsCount_one': '{count} point',
  'tracker.tile.pointsCount_other': '{count} points',
  'tracker.timeouts.ask.full':
    'No full timeouts left for {team}. Officials charge a technical foul for an extra one. Record it anyway?',
  'tracker.timeouts.ask.no': 'Do not record it',
  'tracker.timeouts.ask.short':
    'No 30-second timeouts left for {team}. Officials charge a technical foul for an extra one. Record it anyway?',
  'tracker.timeouts.ask.yes': 'Record it anyway',
  // The button's name for a screen reader: "Timeouts: Hawks 2 left, Bears none left".
  // On the screen it reads "Timeouts 2 · 1", home first as on the scoreboard.
  'tracker.timeouts.buttonLabel': 'Timeouts: {home} {homeLeft}, {away} {awayLeft}',
  'tracker.timeouts.call.full': 'Full timeout for {team}, {left}',
  'tracker.timeouts.call.short': '30-second timeout for {team}, {left}',
  'tracker.timeouts.chip': 'Timeouts {count}',
  'tracker.timeouts.chipLabel_one': '{team}: {count} timeout left',
  'tracker.timeouts.chipLabel_other': '{team}: {count} timeouts left',
  'tracker.timeouts.chipNone': '{team}: no timeouts left',
  'tracker.timeouts.earlier_one': 'and {count} earlier',
  'tracker.timeouts.earlier_other': 'and {count} earlier',
  'tracker.timeouts.full': 'Full',
  'tracker.timeouts.left_one': '{count} left',
  'tracker.timeouts.left_other': '{count} left',
  'tracker.timeouts.noneLeft': 'none left',
  'tracker.timeouts.noneTaken': 'None taken.',
  'tracker.timeouts.of': '{team} timeouts',
  'tracker.timeouts.rule.both.game': '{full} full and {short} 30-second a game',
  'tracker.timeouts.rule.both.half': '{full} full and {short} 30-second a half',
  'tracker.timeouts.rule.carry': 'unused carry over',
  'tracker.timeouts.rule.full.game': '{count} full a game',
  'tracker.timeouts.rule.full.half': '{count} full a half',
  'tracker.timeouts.rule.noCarry': 'none carried over',
  'tracker.timeouts.rule.noOvertime': 'none in overtime',
  'tracker.timeouts.rule.none.game': 'None a game',
  'tracker.timeouts.rule.none.half': 'None a half',
  'tracker.timeouts.rule.overtime': '{count} more each overtime',
  'tracker.timeouts.rule.short.game': '{count} 30-second a game',
  'tracker.timeouts.rule.short.half': '{count} 30-second a half',
  'tracker.timeouts.short': '30-second',
  'tracker.timeouts.takeBack': 'Take back the latest {team} timeout',
  'tracker.timeouts.taken.full': '{period} {clock} · Full',
  // One timeout taken. Where the league has one length, the period and the time are all
  // of it; with two lengths each says which. Then how many came before the latest two.
  'tracker.timeouts.taken.one': '{period} {clock}',
  'tracker.timeouts.taken.short': '{period} {clock} · 30-second',
  // Timeouts: both teams', in the pad.
  'tracker.timeouts.title': 'Timeouts',
  // The courtside tracker (P2 §4): opening a game on the device (step 2.33). The
  // scoring screens come with steps 2.35 to 2.37.
  'tracker.title': 'Score a game',
  'tracker.turnovers.addTeam': '+ Team turnover',
  'tracker.turnovers.addTeamHelp':
    'For a turnover charged to no player, such as a shot-clock violation.',
  'tracker.turnovers.chip_one': '{count} turnover',
  'tracker.turnovers.chip_other': '{count} turnovers',
  'tracker.turnovers.none': 'No turnovers yet. Tap a player, then Turnover.',
  'tracker.turnovers.takeBack': 'Take back one turnover from {who}',
  'tracker.turnovers.takeBackTeam': 'Take back one team turnover from {team}',
  'tracker.turnovers.team': 'Team',
  'tracker.turnovers.title': '{team} turnovers',
  // Undo (step 2.37; checklist I1 to I3): the button names the play it takes back, and
  // the screen then says what happened in a sentence.
  'tracker.undo.button': 'Undo',
  'tracker.undo.correctionAsk': 'This was added by a correction after the game. Take it back?',
  'tracker.undo.correctionLeave': 'Leave it',
  'tracker.undo.correctionTakeBack': 'Take it back',
  'tracker.undo.done': 'Undone: {play}.',
  'tracker.undo.doneClock': 'Undone: {play}. The clock is back at {clock}, stopped.',
  'tracker.undo.doneStopped':
    'Undone: {play}. The clock stays stopped: start it when play goes on.',
  // The two long ones said shorter where a phone is short of room (as the sentence after
  // a set clock, step 2.189): the play and the players in their shortest words.
  'tracker.undo.doneStoppedShort': '{play} undone · clock stopped',
  'tracker.undo.doneSub': 'Undone: {out} is back on the court and {in} is on the bench.',
  'tracker.undo.doneSubShort': '{out} back on · {in} off',
  'tracker.undo.label': 'Undo {play}',
  'tracker.undo.nothing': 'Undo: nothing to take back',
  'tracker.unknownGame': 'We could not find that game.',
  // The upload page of a copy of a game (step 2.70): any phone or computer, signed in.
  'tracker.upload.addedNone': 'No play in the copy was new.',
  'tracker.upload.added_one': '{count} play was new: it is saved now.',
  'tracker.upload.added_other': '{count} plays were new: they are saved now.',
  'tracker.upload.alreadyThere_one':
    'The server already had {count} play, so it was not counted again.',
  'tracker.upload.alreadyThere_other':
    'The server already had {count} plays, so they were not counted again.',
  'tracker.upload.back': 'Back to your games',
  'tracker.upload.done': 'The copy is uploaded.',
  'tracker.upload.empty': 'The copy held no plays: there was nothing to send.',
  'tracker.upload.failed':
    'The copy could not be uploaded: the server did not answer. Check the connection and try again. Uploading it again never counts a play twice.',
  'tracker.upload.file': 'The copy’s file',
  'tracker.upload.intro':
    'Pick the file saved by “Save a copy” on the scoring device. Its plays are sent to the server; any the server already has are skipped, so nothing is counted twice.',
  'tracker.upload.link': 'Upload a copy of this game',
  'tracker.upload.noFile': 'Pick the copy’s file first.',
  'tracker.upload.notKept.other_one':
    '{count} play was not taken: this season does not keep its statistic. An admin can change that in “Statistics kept”.',
  'tracker.upload.notKept.other_other':
    '{count} plays were not taken: this season does not keep their statistic. An admin can change that in “Statistics kept”.',
  'tracker.upload.notKept.turnovers_one':
    '{count} turnover was not taken: this season does not keep turnovers. An admin can change that in “Statistics kept”.',
  'tracker.upload.notKept.turnovers_other':
    '{count} turnovers were not taken: this season does not keep turnovers. An admin can change that in “Statistics kept”.',
  'tracker.upload.notNow': 'Nothing was uploaded. The game stays with that device.',
  'tracker.upload.notTaken_one':
    '{count} play was not taken: the game’s rules refused it, or another device took the game while the copy was being sent.',
  'tracker.upload.notTaken_other':
    '{count} plays were not taken: the game’s rules refused them, or another device took the game while the copy was being sent.',
  'tracker.upload.send': 'Upload the copy',
  'tracker.upload.sending': 'Uploading…',
  'tracker.upload.signedOut': 'You are signed out. Sign in again, then upload the copy.',
  'tracker.upload.title': 'Upload a copy of the game',
  'tracker.upload.tooLarge':
    'This file is too large to be a copy of a game. Pick the file “Save a copy” wrote on the scoring device.',
  'tracker.upload.unreadable': 'This file could not be opened on this device. Pick it again.',
  'tracker.where.bench': 'bench',
  'tracker.where.floor': 'on court',
} as const;
