// The teams of the current season that are a signed-in person's own in one league (step
// 2.168; U-5, P4 §4): those they lead (a coach or captain role on the team, still in force)
// and those they have a roster place on now. What the account menu's "My team", the
// members' page `/{league}/my` and the private read behind a page's "your team" marks
// (my-team-read.ts) all go by, so the three never disagree. The account and its grants
// come from the server's session, never from the request; the league is the one the
// request's address found. In the order the league home's start page reads them (by name,
// then id; start-page.ts, chooseMyTeam), so the first is the team the league opens on for
// them when the league starts members on their team.
import type { AccessHolder } from '@srleagues/core';
import { myTeamSlugOf } from '../../server/my-team-cookie.ts';
import type { WebPorts } from '../../server/ports.ts';
import { chooseSeason } from '../stats-pages/index.ts';
import { teamIdsFromGrants } from './start-page.ts';

/** One of a person's own teams, as a page names it. */
export type MyTeam = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly color: string | null;
};

export type MyTeams = {
  /** Their teams of the current season, by name; none for a member of no team. */
  readonly teams: readonly MyTeam[];
  /**
   * The team the league home opens on for them: the first of their teams, when the league
   * starts members on their team's page (U-5); undefined when it starts on the league home.
   */
  readonly startsOn: string | undefined;
};

export type MyTeamsInput = {
  readonly leagueId: string;
  /** The signed-in account, from the session. */
  readonly accountId: string;
  /** The account's grants in the league, read fresh (T-75). */
  readonly holder: () => Promise<AccessHolder | undefined>;
};

const none: MyTeams = { teams: [], startsOn: undefined };

/** The signed-in person's own teams of the league's current season. */
export async function myTeamsOf(
  ports: Pick<WebPorts, 'publicTeams' | 'publicStats'>,
  input: MyTeamsInput,
): Promise<MyTeams> {
  const { leagueId, accountId } = input;
  const season = chooseSeason(await ports.publicStats.seasonsOf(leagueId), undefined);
  if (season === undefined) return none;
  const [teams, holder, rosterTeamIds, startPage] = await Promise.all([
    ports.publicStats.readStoreOf(leagueId).teams(season.id),
    input.holder(),
    ports.publicTeams.teamIdsOfAccount(leagueId, season.id, accountId),
    ports.publicTeams.startPageOf(leagueId),
  ]);
  // A grant is the account's own only when the holder read is for this account.
  const grantTeamIds = holder?.accountId === accountId ? teamIdsFromGrants(holder) : [];
  const mine = new Set([...grantTeamIds, ...rosterTeamIds].map((id) => id.toLowerCase()));
  const own = [...teams]
    .filter((team) => mine.has(team.id.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map(({ id, slug, name, color }) => ({ id, slug, name, color }));
  return { teams: own, startsOn: startPage === 'myTeam' ? own[0]?.slug : undefined };
}

/**
 * The team of the current season this device chose ("Make this my team", U-5, R-10), by the
 * short name its cookie holds: only while the league offers the choice (it starts members
 * on their team's page, as the team page's button is offered then), and only a team of the
 * season. Undefined for anything else.
 */
export async function chosenTeamOf(
  ports: Pick<WebPorts, 'publicTeams' | 'publicStats'>,
  leagueId: string,
  remembered: string | undefined,
): Promise<MyTeam | undefined> {
  const slug = myTeamSlugOf(remembered);
  if (slug === undefined) return undefined;
  if ((await ports.publicTeams.startPageOf(leagueId)) !== 'myTeam') return undefined;
  const season = chooseSeason(await ports.publicStats.seasonsOf(leagueId), undefined);
  if (season === undefined) return undefined;
  const team = (await ports.publicStats.readStoreOf(leagueId).teams(season.id)).find(
    (row) => row.slug === slug,
  );
  return team === undefined
    ? undefined
    : { id: team.id, slug: team.slug, name: team.name, color: team.color };
}

/** Where `/{league}/my` takes a signed-in member (step 2.168). */
export type MyTeamWay =
  /** Their one team's page. */
  | { readonly kind: 'team'; readonly slug: string }
  /** The page that shows their teams, to open the one they want. */
  | { readonly kind: 'choose' }
  /** The sentence that says they are on no team here. */
  | { readonly kind: 'none' };

export function myTeamWay(teams: readonly MyTeam[]): MyTeamWay {
  const [only, second] = teams;
  if (only === undefined) return { kind: 'none' };
  return second === undefined ? { kind: 'team', slug: only.slug } : { kind: 'choose' };
}
