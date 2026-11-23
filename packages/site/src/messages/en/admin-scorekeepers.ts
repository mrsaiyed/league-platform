// English interface text (T-187), one part of `en`, which ../en.ts joins:
// Admin → Games → Scorekeepers (step 2.56).
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
export const enAdminScorekeepers = {
  'adminScorekeepers.alreadyOn': '{name} (already assigned)',
  'adminScorekeepers.assign.label': 'Assign a scorekeeper to {game}',
  'adminScorekeepers.assign.person': 'Who',
  'adminScorekeepers.assign.submit': 'Assign',
  'adminScorekeepers.back': 'Back to the games',
  'adminScorekeepers.everyGame': '{name} (scores every game anyway)',
  'adminScorekeepers.game': '{home} vs {away}',
  'adminScorekeepers.intro':
    'Who scores each game still to be played. An assigned scorekeeper finds the game in "My games to score".',
  'adminScorekeepers.list': 'Games still to be played',
  'adminScorekeepers.live': 'Being played',
  'adminScorekeepers.nameless': 'Someone with no name given',
  'adminScorekeepers.noGames': 'This season has no games still to be played.',
  'adminScorekeepers.noOne': 'No one is assigned yet.',
  'adminScorekeepers.noOneElse':
    'No one else may score this game. Give someone the scorekeeper role on the Admins page.',
  'adminScorekeepers.noSeason': 'There is no season yet, so there are no games to assign.',
  'adminScorekeepers.postponed': 'Postponed',
  'adminScorekeepers.problem.already-assigned': 'That person is already assigned to this game.',
  'adminScorekeepers.problem.cannot-score-game':
    'That person may not score this game. Give them the scorekeeper role first.',
  'adminScorekeepers.problem.game-closed':
    'That game is over or cancelled, so no one can be assigned to it.',
  'adminScorekeepers.problem.game-not-found': 'That game is not there any more.',
  'adminScorekeepers.problem.not-allowed': 'You may not change who scores these games.',
  'adminScorekeepers.problem.not-assigned': 'That person is not assigned to this game any more.',
  'adminScorekeepers.problem.person-missing': 'Choose who to assign.',
  'adminScorekeepers.problem.season-not-found': 'That season is not there.',
  'adminScorekeepers.problem.unknown': 'That did not save. Try again.',
  'adminScorekeepers.remove.label': 'Take {name} off {game}',
  'adminScorekeepers.remove.submit': 'Take off',
  'adminScorekeepers.rule.anyScorekeeper':
    'In this league every scorekeeper may score any game: assigning puts the game on their list.',
  'adminScorekeepers.rule.assignedOnly':
    'In this league a scorekeeper may score only the games they are assigned to.',
  'adminScorekeepers.said.assigned': '{name} is assigned to {game}.',
  'adminScorekeepers.said.removed': '{name} is taken off {game}.',
  'adminScorekeepers.season': 'Season: {name}',
  'adminScorekeepers.title': 'Scorekeepers',
} as const;
