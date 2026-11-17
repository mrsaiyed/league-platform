// The way back to a team's page from Schedule (step 2.180, A-17). "Remove this team" leads
// here to remove the team's games and publish the schedule; the address names the team
// (`?fromTeam=`), every form of the grid carries it on, and the page offers the way back
// until the person leaves Schedule.
import type { GridTeam } from './build-grid.ts';

/** The address's name for the team to go back to. */
export const backToTeamParam = 'fromTeam';

/** The team page's "Remove this team" panel, where the way back lands (teams-area's anchor). */
export const removeTeamPanelAnchor = 'remove-team';

/** Schedule's publish box, where "Go to publishing" leads. */
export const publishAnchor = 'publish-heading';

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The team id the address names, if it is one's shape: what a form carries on. */
export function backToTeamId(value: unknown): string | undefined {
  return typeof value === 'string' && uuidShape.test(value) ? value.toLowerCase() : undefined;
}

/** The season's team to offer the way back to: one the address names, not in the bin. */
export function backToTeamOf(value: unknown, teams: readonly GridTeam[]): GridTeam | undefined {
  const id = backToTeamId(value);
  return id === undefined ? undefined : teams.find((t) => t.id === id && t.removed !== true);
}
