// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The tracker.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enTracker = {
  'tracker.back': 'Back to your games',
  'tracker.bench.comesInFor': 'Who comes in for {player}?',
  'tracker.bench.everyoneOn': 'Everyone is on the court.',
  'tracker.bench.more_one': '{count} more',
  'tracker.bench.more_other': '{count} more',
  'tracker.bench.of': '{team} bench',
  'tracker.bench.open': 'Bench {count}',
  'tracker.bench.showAll': 'Show all of the {team} bench',
  'tracker.bench.title': 'Bench',
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
  'tracker.court.teamScore': '{team}: {score}',
  'tracker.court.watch': 'Open the public game page',
  'tracker.court.watchHelp': 'Opens in a new tab. This screen stays open.',
  'tracker.floor.title': 'On court',
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
  'tracker.heldByOther': '{name} is scoring this game on another device.',
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
  // On the page that replaces the scoring screen when the device stops scoring (taken
  // over, signed out, no longer allowed) in the very moment a tap was made.
  'tracker.lastTapNotRecorded':
    'Your last tap was made as this device stopped scoring, so it was not recorded. Enter it again once the game is being scored.',
  'tracker.lineup.noPlayers': 'No {team} players yet.',
  'tracker.lineup.pick': 'Pick the starting {size}: tap players below.',
  'tracker.lineup.picked': '{count} of {size} picked.',
  'tracker.lineup.startWith': 'Start with {count}',
  'tracker.mark.off': 'Off',
  // On a tile for a moment, for the two players of a substitution.
  'tracker.mark.on': 'On',
  'tracker.matchup': '{away} at {home}',
  'tracker.noStorage':
    'This browser window cannot save the game on this device, so scoring is off. If this is a private window, open the tracker in a normal one.',
  // No longer allowed to score, with plays still on the device (finding M2).
  'tracker.notAllowedKept_one':
    'You are no longer allowed to score this game. {count} play is still on this device and is not saved. If an admin gives the game back to you, open it again here and it is sent.',
  'tracker.notAllowedKept_other':
    'You are no longer allowed to score this game. {count} plays are still on this device and are not saved. If an admin gives the game back to you, open it again here and they are sent.',
  'tracker.notApplied_one': '{count} action was not applied. The game now shows what was saved.',
  'tracker.notApplied_other':
    '{count} actions were not applied. The game now shows what was saved.',
  'tracker.notAssigned':
    'You are not assigned to score this game. Ask a league admin to assign it to you.',
  'tracker.notLive.box-score':
    'This game is set to box score, so there is no live scoring. Enter its score in Games.',
  // The tracker's own refusals, each with the way back to the games (step 2.33).
  'tracker.notLive.final-score':
    'This game is set to final score only, so there is no live scoring. Enter its score in Games.',
  'tracker.notSaved_one':
    '{count} action on this device was not saved. Enter it again if it is needed.',
  'tracker.notSaved_other':
    '{count} actions on this device were not saved. Enter them again if they are needed.',
  'tracker.openAgain': 'Open the game again',
  'tracker.opening': 'Opening the game…',
  'tracker.openingSlow': 'No answer yet. Check the connection; this keeps trying.',
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
  'tracker.play.sub': 'Sub: {in} in for {out}',
  'tracker.play.team-turnover': 'Team turnover: {team}',
  'tracker.play.team-unturnover': 'Team turnover taken back: {team}',
  'tracker.play.timeout.full': 'Full timeout: {team}',
  'tracker.play.timeout.short': '30-second timeout: {team}',
  'tracker.play.turnover': 'Turnover by {player}',
  'tracker.play.unfoul': 'Foul taken back: {player}',
  'tracker.play.untimeout': 'Timeout taken back: {team}',
  'tracker.play.unturnover': 'Turnover taken back: {player}',
  'tracker.player.fullName': '{first} {last}',
  'tracker.player.name': '{name}',
  'tracker.player.number': '#{jersey}',
  'tracker.player.numberName': '#{jersey} {name}',
  // A player the game has and this device's rosters do not (added at another table).
  'tracker.player.unknown': 'Player not on this device’s list',
  'tracker.player.unlistedShort': 'Not listed',
  'tracker.pregame.players_one': '{team}: {count} player',
  'tracker.pregame.players_other': '{team}: {count} players',
  'tracker.pregame.title': 'Before tip-off',
  'tracker.pregame.todo':
    'Check both teams’ jersey numbers, tap each team’s starters, then start the clock.',
  // The tracker's saved banner (T6 §4), chosen from the queue's status by
  // apps/web/src/features/tracker/queue-banner.ts.
  'tracker.queue.allSaved': 'All saved',
  'tracker.queue.notSaved_one': '{count} action not saved',
  'tracker.queue.notSaved_other': '{count} actions not saved',
  'tracker.queue.separator': ' · ',
  'tracker.queue.storageFailed': 'This device could not save to its storage',
  'tracker.queue.waiting_one': '{count} action waiting to send',
  'tracker.queue.waiting_other': '{count} actions waiting to send',
  'tracker.say.notScoring':
    'This device is not scoring the game right now, so that was not recorded.',
  'tracker.say.outRecorded': '{player} is out. The foul was recorded anyway.',
  'tracker.say.storage':
    'This device could not keep that tap, so it was not recorded. Tap it again.',
  'tracker.say.subAcrossTeams': 'Substitutions have to stay within one team.',
  'tracker.say.subBenchToFloor': 'Drag a bench player onto someone on the court.',
  'tracker.say.teamTurnover': 'Team turnover: {team}.',
  'tracker.say.turnover': 'Turnover: {player}.',
  'tracker.seeWhoIsScoring': 'See who is scoring',
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
  'tracker.storeFailed':
    'This device could not keep its own copy of the game. Keep scoring: your plays are still saved. If the page reloads with no connection, the game may not open.',
  'tracker.takeOver': 'Take over scoring',
  'tracker.takeOverNo': 'Not now',
  'tracker.takeOverQuestion':
    'Take over scoring from {name}? Their device stops scoring. Plays it has not sent yet will not be saved and must be entered again.',
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
  'tracker.unknownGame': 'We could not find that game.',
  'tracker.where.bench': 'bench',
  'tracker.where.floor': 'on court',
} as const;
