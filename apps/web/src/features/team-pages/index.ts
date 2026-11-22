// The public teams pages and the members' start page (step 2.44). Used only through this file.
export { TeamsPage } from './teams-page.tsx';
export { TeamPage } from './team-page.tsx';
export {
  buildRoster,
  buildTeamGames,
  loadTeamCardsOf,
  loadTeamHead,
  loadTeamStats,
  type TeamCard,
} from './build-team.ts';
export { MyPage } from './my-page.tsx';
export { YourTeamLine } from './my-team-marks.tsx';
export { myTeamReply, type MyTeamReply } from './my-team-read.ts';
export { chosenTeamOf, myTeamsOf, type MyTeam, type MyTeams } from './my-teams.ts';
export { startPageRedirect } from './start-redirect.ts';
export { leagueHomeStayUrl, stayAtHome } from './start-page.ts';
