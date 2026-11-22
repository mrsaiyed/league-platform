// GET /api/v1/leagues/{leagueId}/my-team (step 2.168; U-5, R-10, T-95): what a public page
// marks as the person's own team, read after the page has arrived by the page's own script
// (features/team-pages/my-team-read.ts), so the page is the same for everyone who opens it
// and holds no trace of anyone (T5 §4). It answers:
// - `teams`: the signed-in person's own teams of the season here (myTeamsOf: a coach or
//   captain role on the team, or a roster place), by short name;
// - `startsOn`: the one of them the league home opens on for them, when the league starts
//   members on their team's page;
// - `marked`: the teams a page marks "Your team": the person's own, or, for someone with
//   none here, the team this device chose ("Make this my team"), while the league offers
//   that choice;
// - and the words to draw them in, when there is anything to draw.
//
// The league comes from the address and the account from the session (league-api.ts), never
// from the request; the device's choice is its own cookie, taken only when it names a team
// of the league's current season. A league its visitor may not see (a draft or a suspended
// one, mayOpenLeague, U-9) is "not found", exactly the answer for a league that does not
// exist or is in the bin, as the other public reads answer (game-snapshot-endpoint.ts,
// scoring-offers-endpoint.ts). Always private, never kept by a cache.
import {
  leagueUrl,
  mayOpenLeague,
  type AccessHolder,
  type CommandContext,
  type LeagueAddressee,
} from '@srleagues/core';
import type { MyTeam, MyTeamReply, MyTeams } from '../features/team-pages/index.ts';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { refusalAnswer, type ApiAnswer, type ApiRefusal } from './league-api.ts';
import { t } from './messages.ts';

const privately = { 'Cache-Control': 'private, no-store' } as const;
const answer = (body: MyTeamReply): ApiAnswer => ({ status: 200, body, headers: privately });

/** "Not found", word for word the other public reads' answer for a hidden league. */
const notFound: ApiAnswer = {
  status: 404,
  body: { error: 'not-found' },
  headers: { 'Cache-Control': 'no-store' },
};

/** Nothing to mark: a visitor with no team chosen, a member of no team. */
export const nothingMine: MyTeamReply = { teams: [], startsOn: null, marked: [] };

/** What the read needs from the web app's ports, bound to the request's league by the route. */
export type MyTeamReadPorts = {
  /** What the account holds in the league, read fresh (T-75). */
  readonly accessOf: (context: CommandContext) => Promise<AccessHolder | undefined>;
  /** The signed-in account's own teams of the season in `leagueId` (myTeamsOf). */
  readonly myTeams: (
    leagueId: string,
    accountId: string,
    holder: AccessHolder | undefined,
  ) => Promise<MyTeams>;
  /**
   * The team of the season in `leagueId` this device chose, when the league offers the
   * choice and `slug` is one of its teams (chosenTeamOf); else undefined.
   */
  readonly chosenTeam: (leagueId: string, slug: string | undefined) => Promise<MyTeam | undefined>;
};

const markOf = (league: LeagueAddressee, team: MyTeam): MyTeamReply['marked'][number] => ({
  slug: team.slug,
  name: team.name,
  color: team.color,
  href: leagueUrl(league, 'team', { team: team.slug }),
});

/**
 * The answer to the read, from the league request as league-api.ts resolved it with the
 * ports beside it (or why there is none), and the short name this device's cookie holds.
 */
export async function myTeamRequest(
  resolved:
    | {
        readonly ok: true;
        readonly context: LeagueRequestContext;
        readonly ports: MyTeamReadPorts;
      }
    | { readonly ok: false; readonly refusal: ApiRefusal },
  remembered: string | undefined,
): Promise<ApiAnswer> {
  if (!resolved.ok) {
    if (resolved.refusal.status === 404) return notFound;
    return { ...refusalAnswer(resolved.refusal), headers: privately };
  }
  const { context, ports } = resolved;
  const league = context.league;
  const holder =
    context.account === null ? undefined : await ports.accessOf(commandContextOf(context));
  // The league gate, as for the league's pages and the other public reads (U-9).
  if (!mayOpenLeague(league.status, holder)) return notFound;
  const own =
    context.account === null
      ? { teams: [], startsOn: undefined }
      : await ports.myTeams(league.id, context.account.accountId, holder);
  // A member's own teams are what the league opens on for them; the device's choice counts
  // only for someone with no team here, as on the league home (start-page.ts).
  const chosen = own.teams.length > 0 ? undefined : await ports.chosenTeam(league.id, remembered);
  const marked = own.teams.length > 0 ? own.teams : chosen === undefined ? [] : [chosen];
  if (marked.length === 0) return answer(nothingMine);
  return answer({
    teams: own.teams.map((team) => team.slug),
    startsOn: own.startsOn ?? null,
    marked: marked.map((team) => markOf(league, team)),
    words: {
      yours: t('team.yours'),
      opensHere: t('team.yoursOpensHere'),
      mark: t('teams.yours'),
    },
  });
}
