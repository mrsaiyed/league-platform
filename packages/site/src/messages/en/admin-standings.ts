// English interface text (T-187), one part of `en`, which ../en.ts joins:
// Admin → Standings and stats (step 2.56).
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
export const enAdminStandings = {
  'adminStandings.add.submit': 'Add the adjustment',
  'adminStandings.add.title': 'Add an adjustment',
  'adminStandings.award.intro':
    'A game that was not played, given to one team by ruling: a win for one, a loss for the other, and a game played each.',
  'adminStandings.award.submit': 'Award the game',
  'adminStandings.award.title': 'Award a game not played',
  'adminStandings.award.what': 'a game awarded to {winner} over {loser}',
  'adminStandings.field.game': 'Game',
  'adminStandings.field.loser': 'Loss to',
  'adminStandings.field.losses': 'Losses',
  'adminStandings.field.points': 'Points',
  'adminStandings.field.pointsHelp': 'Only counts in a table ranked by points.',
  'adminStandings.field.reason': 'Reason',
  'adminStandings.field.reasonHelp':
    'Shown under the public table, beside the change. For example: "Forfeit penalty, round 3".',
  'adminStandings.field.removeReason': 'Why it comes off',
  'adminStandings.field.removeReasonHelp': 'Kept in the activity log.',
  'adminStandings.field.team': 'Team',
  'adminStandings.field.ties': 'Ties',
  'adminStandings.field.winner': 'Awarded to',
  'adminStandings.field.wins': 'Wins',
  'adminStandings.field.winsHelp': 'A whole number. Put a minus sign in front to take away.',
  'adminStandings.flip.byHand': 'Ordered by a coin flip recorded on {date}.',
  'adminStandings.flip.drawHelp':
    'We pick the order at random, fairly, and say so under the table.',
  'adminStandings.flip.drawLabel': 'Flip a coin for {teams}',
  'adminStandings.flip.drawSubmit': 'Flip for us',
  'adminStandings.flip.drawn': 'Ordered by a coin flip we made for you on {date}.',
  'adminStandings.flip.intro':
    'These teams are level after every tiebreaker, so they share a place. Flip a coin at the table and record who goes first, or let us flip for you. You can change it or take it off.',
  'adminStandings.flip.level': 'Level now: they share a place until a coin flip is recorded.',
  'adminStandings.flip.none': 'No teams are level after every tiebreaker this season.',
  'adminStandings.flip.note': 'Note (optional)',
  'adminStandings.flip.noteHelp': 'Who flipped, or anything worth keeping with it.',
  'adminStandings.flip.place': 'Place {place}',
  'adminStandings.flip.record': 'Record the order of {teams}',
  'adminStandings.flip.remove.confirm': 'Yes, take this coin flip off',
  'adminStandings.flip.remove.label': 'Take off the coin flip for {teams}',
  'adminStandings.flip.remove.submit': 'Take the coin flip off',
  'adminStandings.flip.said.removed':
    'Taken off: the coin flip for {what}. The table is worked out again.',
  'adminStandings.flip.said.saved': 'Saved: a coin flip for {what}. The table is worked out again.',
  'adminStandings.flip.submit': 'Save this order',
  'adminStandings.flip.title': 'Teams level after every tiebreaker',
  'adminStandings.flip.unused': 'Coin flips no longer in use',
  'adminStandings.flip.unusedHelp':
    'Results have changed since: the teams each flip names are no longer level as that set, so it orders nobody now, and taking it off changes nothing in the public table.',
  'adminStandings.gamePlayed': '+1 game played',
  'adminStandings.intro':
    'The table is worked out from the results. An adjustment changes a team’s line with a reason, which the public table shows as a footnote.',
  'adminStandings.list': 'Adjustments this season',
  'adminStandings.noSeason': 'There is no season yet. Add one in Season settings first.',
  'adminStandings.noTeams': 'This season has no teams yet, so there is nothing to adjust.',
  'adminStandings.none': 'No adjustments this season. The table is the results as they are.',
  'adminStandings.overturn.game': '{home} {homeScore}–{awayScore} {away}',
  'adminStandings.overturn.intro':
    'The winner of the game takes a loss instead of the win, and the loser a win instead of the loss. The score stays as it was.',
  'adminStandings.overturn.none':
    'No game this season has a winner yet, so there is nothing to overturn.',
  'adminStandings.overturn.reasonText': '{game}: {reason}',
  'adminStandings.overturn.submit': 'Overturn the result',
  'adminStandings.overturn.title': 'Overturn a result',
  'adminStandings.overturn.what': 'the result of {game} overturned',
  'adminStandings.pairNote': 'One of a pair: taking it off takes the other team’s half off too.',
  'adminStandings.problem.adjustment-not-counted':
    'That would take a team’s count below zero, or change nothing the table shows. Nothing was saved.',
  'adminStandings.problem.adjustment-not-found':
    'That adjustment has already been taken off. The list has been brought up to date.',
  'adminStandings.problem.flip-not-found': 'That coin flip has already been taken off.',
  'adminStandings.problem.game-already-overturned':
    'That result has already been overturned. Nothing more was saved.',
  'adminStandings.problem.game-has-no-winner': 'That game has no winner to overturn.',
  'adminStandings.problem.game-not-found': 'Choose one of this season’s decided games.',
  'adminStandings.problem.invalid-number':
    'Type a whole number, such as 1 or -2, or leave it empty.',
  'adminStandings.problem.not-allowed': 'You cannot change this season’s standings.',
  'adminStandings.problem.not-confirmed': 'Tick the box first, to say you are sure.',
  'adminStandings.problem.nothing-changes':
    'Type at least one change: wins, losses, ties or points.',
  'adminStandings.problem.number-too-big':
    'That is too big a change. Wins, losses and ties go from -{count} to {count}, points from -{points} to {points}.',
  'adminStandings.problem.place-twice': 'Put each team in one place only.',
  'adminStandings.problem.reason-missing': 'Say why, in a few words. It is kept with the change.',
  'adminStandings.problem.reason-too-long': 'Keep the reason to 500 letters or fewer.',
  'adminStandings.problem.same-team': 'Choose two different teams.',
  'adminStandings.problem.season-not-found':
    'That season is no longer there. Open Standings and stats again.',
  'adminStandings.problem.team-not-found': 'Choose one of this season’s teams.',
  'adminStandings.problem.teams-not-level':
    'These teams are no longer level after every tiebreaker. Look at the list again.',
  'adminStandings.problem.unknown': 'That could not be done just now. Try again.',
  'adminStandings.publicLink': 'See the public table',
  'adminStandings.remove.confirm': 'Yes, take this adjustment off',
  'adminStandings.remove.label': 'Take off the adjustment for {team}',
  'adminStandings.remove.submit': 'Take it off',
  'adminStandings.said.added': 'Saved: {what}. The table is worked out again.',
  'adminStandings.said.removed': 'Taken off: {what}. The table is worked out again.',
  'adminStandings.season': 'Season: {name}',
  'adminStandings.title': 'Standings and stats',
  'adminStandings.what': '{team}, {changes}',
};
