// The teams module (T2 §3). Other modules and packages use only what is here.
export { addToRoster, type AddToRosterError } from './commands/add-to-roster.ts';
export { changeRosterEntry, type ChangeRosterEntryError } from './commands/change-roster-entry.ts';
export { listRoster, type ListRosterError } from './commands/list-roster.ts';
export { markLeft, type MarkLeftError } from './commands/mark-left.ts';
export { reorderRoster, type ReorderRosterError } from './commands/reorder-roster.ts';
export { createTeam, type CreateTeamError } from './commands/create-team.ts';
export { removeTeam, type RemoveTeamError } from './commands/remove-team.ts';
export {
  setTeamStatsVisibility,
  type SetTeamStatsVisibilityError,
} from './commands/set-team-stats-visibility.ts';
export { updateTeam, type UpdateTeamError } from './commands/update-team.ts';
export { statsVisibilityChoices, type TeamStatsVisibility } from './team-fields.ts';
export { rosterRoles } from './roster-fields.ts';
export type {
  NewRosterEntry,
  NewTeam,
  RosterEntryChange,
  RosterEntryRecord,
  RosterLine,
  RosterTaken,
  TeamChange,
  TeamRecord,
  TeamsStore,
  TeamsTx,
  TeamTaken,
} from './ports.ts';
