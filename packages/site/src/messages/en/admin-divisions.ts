// English interface text (T-187), one part of `en`, which ../en.ts joins:
// Admin → Season settings → Divisions (step 2.49).
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
export const enAdminDivisions = {
  'adminDivisions.add.submit': 'Add the division',
  'adminDivisions.add.title': 'Add a division',
  'adminDivisions.change.label': 'Change {name}',
  'adminDivisions.change.submit': 'Save',
  'adminDivisions.field.color': 'Color',
  'adminDivisions.field.name': 'Name',
  'adminDivisions.field.nameHelp': 'Such as East, or Mecca Conference. Up to 120 letters.',
  'adminDivisions.field.useOwnColors': 'Use the league’s own colors',
  'adminDivisions.heldByDivisions':
    '{name} cannot be removed while divisions sit under it. Remove them first.',
  'adminDivisions.heldByTeams_one':
    '{name} cannot be removed while a team is in it. Move it to another division, or out of divisions, in Teams first.',
  'adminDivisions.heldByTeams_other':
    '{name} cannot be removed while {count} teams are in it. Move them to another division, or out of divisions, in Teams first.',
  'adminDivisions.intro':
    'Group the season’s teams. Each division has its own name and color, in the order you set.',
  'adminDivisions.list': 'The season’s divisions',
  'adminDivisions.move.down': 'Move down',
  'adminDivisions.move.downLabel': 'Move {name} down',
  'adminDivisions.move.up': 'Move up',
  'adminDivisions.move.upLabel': 'Move {name} up',
  'adminDivisions.noSeason':
    'The league has no season yet. Divisions belong to a season, so they come once it has one.',
  'adminDivisions.none':
    'This season has no divisions, so all its teams play in one group. Add a division to split them.',
  'adminDivisions.problem.changed-since-read':
    'Someone else changed this just now. The screen shows it as it is now: try again.',
  'adminDivisions.problem.division-has-subdivisions':
    'Divisions sit under this one. Remove them first.',
  'adminDivisions.problem.division-has-teams':
    'A team is in this division now. Move it to another division in Teams first.',
  'adminDivisions.problem.division-name-taken':
    'Another division of this season has that name. Choose another one.',
  'adminDivisions.problem.division-not-found':
    'That division is not there any more. The screen shows the divisions as they are now.',
  'adminDivisions.problem.division-parent-in-bin':
    'The division it sat under is in the bin. Put that one back first.',
  'adminDivisions.problem.divisions-incomplete':
    'The divisions changed just now. The screen shows them as they are now: try again.',
  'adminDivisions.problem.invalid-input': 'Give the division a name, of up to 120 letters.',
  'adminDivisions.problem.not-allowed': 'You cannot change this season’s divisions.',
  'adminDivisions.problem.not-confirmed': 'Tick the box first, to say you are sure.',
  'adminDivisions.problem.restore-name-taken':
    'Another division has its name now. Rename that one, then put this one back.',
  'adminDivisions.problem.season-not-found':
    'That season is not there any more. Reload the page to see the seasons as they are.',
  'adminDivisions.problem.unknown': 'That could not be done just now. Try again.',
  'adminDivisions.putBack.label': 'Put {name} back',
  'adminDivisions.putBack.submit': 'Put it back',
  'adminDivisions.remove.body':
    'It goes to the bin, where it is kept for 30 days. Nothing else goes with it.',
  'adminDivisions.remove.confirm': 'Yes, remove {name}',
  'adminDivisions.remove.label': 'Remove {name}',
  'adminDivisions.remove.submit': 'Remove the division',
  'adminDivisions.said.created': 'Added: {name}.',
  'adminDivisions.said.moved': 'Moved: {name}.',
  'adminDivisions.said.removed': 'Removed: {name}. It is kept in the bin for 30 days.',
  'adminDivisions.said.restored': 'Put back: {name}.',
  'adminDivisions.said.saved': 'Saved: {name}.',
  'adminDivisions.teamsNone': 'No teams in it yet.',
  'adminDivisions.teams_one': '1 team: {names}',
  'adminDivisions.teams_other': '{count} teams: {names}',
  'adminDivisions.title': 'Divisions',
  'adminDivisions.toTeams': 'Go to Teams',
} as const;
