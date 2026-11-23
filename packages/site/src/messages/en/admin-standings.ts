// English interface text (T-187), one part of `en`, which ../en.ts joins:
// Admin → Standings and stats (step 2.56).
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
export const enAdminStandings = {
  'adminStandings.add.submit': 'Add the adjustment',
  'adminStandings.add.title': 'Add an adjustment',
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
  'adminStandings.field.wins': 'Wins',
  'adminStandings.field.winsHelp': 'A whole number. Put a minus sign in front to take away.',
  'adminStandings.intro':
    'The table is worked out from the results. An adjustment changes a team’s line with a reason, which the public table shows as a footnote.',
  'adminStandings.list': 'Adjustments this season',
  'adminStandings.noSeason': 'There is no season yet. Add one in Season settings first.',
  'adminStandings.noTeams': 'This season has no teams yet, so there is nothing to adjust.',
  'adminStandings.none': 'No adjustments this season. The table is the results as they are.',
  'adminStandings.problem.adjustment-not-counted':
    'That would take a team’s count below zero, or change nothing the table shows. Nothing was saved.',
  'adminStandings.problem.adjustment-not-found':
    'That adjustment has already been taken off. The list has been brought up to date.',
  'adminStandings.problem.invalid-number':
    'Type a whole number, such as 1 or -2, or leave it empty.',
  'adminStandings.problem.not-allowed': 'You cannot change this season’s standings.',
  'adminStandings.problem.not-confirmed': 'Tick the box first, to say you are sure.',
  'adminStandings.problem.nothing-changes':
    'Type at least one change: wins, losses, ties or points.',
  'adminStandings.problem.reason-missing': 'Say why, in a few words. It is kept with the change.',
  'adminStandings.problem.reason-too-long': 'Keep the reason to 500 letters or fewer.',
  'adminStandings.problem.season-not-found':
    'That season is no longer there. Open Standings and stats again.',
  'adminStandings.problem.team-not-found': 'Choose one of this season’s teams.',
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
