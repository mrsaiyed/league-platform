// The teams module (T2 §3). Other modules and packages use only what is here.
export { addToRoster, type AddToRosterError } from './commands/add-to-roster.ts';
export { changeRosterEntry, type ChangeRosterEntryError } from './commands/change-roster-entry.ts';
export { countTeamGames, type CountTeamGamesError } from './commands/count-team-games.ts';
export { listRoster, type ListRosterError } from './commands/list-roster.ts';
export { markLeft, type MarkLeftError } from './commands/mark-left.ts';
export {
  putBackOnRoster,
  type PutBackOnRosterError,
  type PutBackOnRosterValue,
} from './commands/put-back-on-roster.ts';
export {
  reorderRoster,
  type ReorderRosterError,
  type ReorderRosterResult,
} from './commands/reorder-roster.ts';
export { createTeam, type CreateTeamError } from './commands/create-team.ts';
export { removeTeam, type RemoveTeamError } from './commands/remove-team.ts';
export {
  setTeamStatsVisibility,
  type SetTeamStatsVisibilityError,
} from './commands/set-team-stats-visibility.ts';
export { updateTeam, type UpdateTeamError } from './commands/update-team.ts';
export { markTeamLeft, type MarkTeamLeftError } from './commands/mark-team-left.ts';
export { undoTeamLeft, type UndoTeamLeftError } from './commands/undo-team-left.ts';
export {
  publicRosterLine,
  publicTeam,
  type PublicDisplay,
  type PublicDivision,
  type PublicRoster,
  type PublicRosterLine,
  type PublicTeam,
  type RosterLineSource,
} from './public-team.ts';
export { statsVisibilityChoices, type TeamStatsVisibility } from './team-fields.ts';
export type { GameWithoutResult, TeamGames } from './team-games.ts';
export { rosterRoles } from './roster-fields.ts';
export type {
  NewRosterEntry,
  NewTeam,
  RosterEntryChange,
  RosterEntryRecord,
  RosterLine,
  RosterTaken,
  TeamChange,
  TeamGamesRecord,
  TeamGameToPlay,
  TeamRecord,
  TeamsStore,
  TeamsTx,
  TeamTaken,
} from './ports.ts';
