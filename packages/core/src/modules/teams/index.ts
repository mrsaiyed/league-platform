// The teams module (T2 §3). Other modules and packages use only what is here.
export { createTeam, type CreateTeamError } from './commands/create-team.ts';
export { removeTeam, type RemoveTeamError } from './commands/remove-team.ts';
export {
  setTeamStatsVisibility,
  type SetTeamStatsVisibilityError,
} from './commands/set-team-stats-visibility.ts';
export { updateTeam, type UpdateTeamError } from './commands/update-team.ts';
export { statsVisibilityChoices, type TeamStatsVisibility } from './team-fields.ts';
export type { NewTeam, TeamChange, TeamRecord, TeamsStore, TeamsTx, TeamTaken } from './ports.ts';
