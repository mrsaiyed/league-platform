// GET /api/v1/leagues/{leagueId}/staff-numbers?page=… (step 2.46; S-22, T-87, T-95, T-287;
// record 085): the player numbers a public page leaves out, for the person signed in on
// this device when their roles let them see more than the public: the league's owner and
// admins, and the coach or captain of a team whose numbers are kept from the public. The
// page's own script asks once the page has arrived (features/staff-numbers), so the page is
// the same for everyone who opens it, and so is every live message (T-120).
//
// The league comes from the address and the account from the server's session
// (league-api.ts), never from the request; what the address asks (which page, season, team
// or game) is only a question. The person's roles are read fresh from the database on this
// request (T-75) and turned into a viewer by core's signedInViewer: for THAT league, and a
// coach's or captain's for THAT team. A league its visitor may not see is "not found", the
// snapshot's own answer (game-snapshot-endpoint.ts).
//
// Anyone the roles let see nothing more (a visitor, a session that no longer works, a
// signed-in member with no role, another team's coach, an admin of another league), a page
// on which nothing is kept from the public, a question that names nothing there, and a
// read that fails all get the one same answer: `{ "more": null }`. So the answer never
// tells anyone that numbers are being kept from them. Every answer is private and never
// kept by any cache (`private, no-store`); none is written to a log. No person's id is in
// any answer: player lines are keyed by their place (`player-0`, `away-player-0`).
import {
  leagueUrl,
  mayOpenLeague,
  publicViewer,
  readGamePage,
  readGameSnapshot,
  readStatisticsTable,
  readTeamsBeyondPublic,
  signedInViewer,
  type AccessHolder,
  type CommandContext,
  type Viewer,
} from '@srleagues/core';
import { z } from 'zod';
import { buildBoxScores, buildPlays, gameWords } from '../features/live-game/build-game.ts';
import { gameNumbersView, type GameNumbersView } from '../features/live-game/game-numbers-view.ts';
import { staffNumbersParts } from '../features/staff-numbers/index.ts';
import { loadStatsPage, parseBy } from '../features/stats-pages/build-stats.ts';
import {
  statsTablesView,
  type StatsTablesView,
} from '../features/stats-pages/stats-tables-view.ts';
import { loadTeamStats } from '../features/team-pages/build-team.ts';
import { teamStatsView, type TeamStatsDrawnView } from '../features/team-pages/team-stats-view.ts';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { refusalAnswer, type ApiAnswer, type ApiRefusal } from './league-api.ts';
import { t } from './messages.ts';
import { publicPlayerKey } from './player-key.ts';
import type { PublicStatsPorts } from './public-stats.ts';
import type { TrackerPorts } from './tracker-ports.ts';

export { staffNumbersParts };

const privately = { 'Cache-Control': 'private, no-store' } as const;

/** "Not found", in the very words and headers of the snapshot's for a hidden league. */
const notFound: ApiAnswer = {
  status: 404,
  body: { error: 'not-found' },
  headers: { 'Cache-Control': 'no-store' },
};

/** What the page draws in place of the public's numbers, and the note above them. */
export type StaffNumbersMore = {
  readonly notice: { readonly title: string; readonly text: string };
} & (
  | { readonly page: 'stats'; readonly view: StatsTablesView }
  | { readonly page: 'team'; readonly view: TeamStatsDrawnView }
  | { readonly page: 'game'; readonly view: GameNumbersView }
);

export type StaffNumbersReply = { readonly more: StaffNumbersMore | null };

/** The one answer for everyone who may see nothing more, whatever the reason. */
export const nothingMore: ApiAnswer = {
  status: 200,
  body: { more: null } satisfies StaffNumbersReply,
  headers: privately,
};

const id = z
  .string()
  .regex(/^[0-9a-fA-F-]{36}$/)
  .transform((value) => value.toLowerCase())
  .pipe(z.uuid());

/** What the page asks about: its own kind, and the season, team or game it shows. */
export const staffNumbersQuestion = z.discriminatedUnion('page', [
  z.object({
    page: z.literal('stats'),
    season: id,
    by: z
      .string()
      .optional()
      .transform((value) => parseBy(value)),
  }),
  z.object({ page: z.literal('team'), season: id, team: id }),
  z.object({ page: z.literal('game'), game: id }),
]);
export type StaffNumbersQuestion = z.output<typeof staffNumbersQuestion>;

/** The question in the address, or null for one this endpoint does not answer. */
export function askedStaffNumbers(query: URLSearchParams): StaffNumbersQuestion | null {
  const parsed = staffNumbersQuestion.safeParse(Object.fromEntries(query.entries()));
  return parsed.success ? parsed.data : null;
}

/** What the read needs from the web app's ports. */
export type StaffNumbersPorts = {
  /** What the account holds in the league, read fresh (T-75). */
  readonly accessOf: (context: CommandContext) => Promise<AccessHolder | undefined>;
  readonly publicStats: Pick<PublicStatsPorts, 'seasonsOf' | 'statisticsOf'>;
  readonly tracker: Pick<TrackerPorts, 'gameReadsOf' | 'clock'>;
};

/** Whether the roles make this viewer see more than anyone of any team at all. */
const mayEverSeeMore = (viewer: Viewer): boolean =>
  viewer.leagueAdmin || viewer.staffOfTeamIds.length > 0;

const noticeFor = (teams: readonly string[]): StaffNumbersMore['notice'] => ({
  title: t('stats.staffNumbers.title'),
  text: t('stats.staffNumbers.text', {
    teams: [...teams].sort((a, b) => a.localeCompare(b)).join(t('stats.teamsJoin')),
  }),
});

/**
 * The answer to the read, from the league request as league-api.ts resolved it with the
 * ports beside it (or why there is none), and the address's question.
 */
export async function staffNumbersRequest(
  resolved:
    | {
        readonly ok: true;
        readonly context: LeagueRequestContext;
        readonly ports: StaffNumbersPorts;
      }
    | { readonly ok: false; readonly refusal: ApiRefusal },
  question: StaffNumbersQuestion | null,
): Promise<ApiAnswer> {
  if (!resolved.ok) {
    if (resolved.refusal.status === 404) return notFound;
    return { ...refusalAnswer(resolved.refusal), headers: privately };
  }
  const { context, ports } = resolved;
  const holder =
    context.account === null ? undefined : await ports.accessOf(commandContextOf(context));
  // The league gate, as for the league's pages and the snapshot (U-9).
  if (!mayOpenLeague(context.league.status, holder)) return notFound;
  if (context.account === null || question === null) return nothingMore;
  const viewer = signedInViewer(context.league.id, holder);
  // A member with no role that could see more is told nothing, and nothing is read.
  if (!mayEverSeeMore(viewer)) return nothingMore;
  const more = await moreFor(context.league, viewer, question, ports).catch(() => null);
  if (more === null) return nothingMore;
  return { status: 200, body: { more } satisfies StaffNumbersReply, headers: privately };
}

async function moreFor(
  league: LeagueRequestContext['league'],
  viewer: Viewer,
  question: StaffNumbersQuestion,
  ports: StaffNumbersPorts,
): Promise<StaffNumbersMore | null> {
  if (question.page === 'game') return gameMore(league, viewer, question.game, ports);
  // Only a season the public may pick, as the page itself shows.
  const seasons = await ports.publicStats.seasonsOf(league.id);
  if (!seasons.some((season) => season.id === question.season)) return null;
  return ports.publicStats.statisticsOf(league.id, async ({ store, settings }) => {
    const beyond = await readTeamsBeyondPublic(
      store,
      { seasonId: question.season },
      { leagueId: league.id, viewer },
    );
    if (!beyond.ok) return null;
    const teams = await store.teams(question.season);
    const nameOf = (teamId: string) => teams.find((team) => team.id === teamId)?.name ?? '';
    if (question.page === 'team') {
      // Only the team the page is for: another team's numbers never come with it.
      if (!beyond.value.includes(question.team)) return null;
      const stats = await loadTeamStats(store, settings, {
        leagueId: league.id,
        seasonId: question.season,
        teamId: question.team,
        viewer,
      });
      if (stats === undefined || !stats.playerLinesShown) return null;
      const view = teamStatsView(stats);
      if (view.kind !== 'numbers' || view.players === null) return null;
      return { page: 'team', notice: noticeFor([nameOf(question.team)]), view };
    }
    // Only a team with a player line to show: a staff-only team with no numbers yet adds
    // nothing, and the answer is the one for a page with nothing kept back.
    const table = await readStatisticsTable(store, {
      seasonId: question.season,
      viewing: {
        leagueId: league.id,
        viewer,
        audience: settings.audience,
        policy: settings.namePolicy,
      },
    });
    if (!table.ok) return null;
    const shownMore = beyond.value.filter((teamId) =>
      table.value.players.some((player) => player.teamIds.includes(teamId)),
    );
    if (shownMore.length === 0) return null;
    const data = await loadStatsPage(store, settings, {
      leagueId: league.id,
      seasonId: question.season,
      by: question.by,
      viewer,
    });
    if ('code' in data) return null;
    const view = statsTablesView(data);
    if (view.kind !== 'tables') return null;
    return { page: 'stats', notice: noticeFor(shownMore.map(nameOf)), view };
  });
}

async function gameMore(
  league: LeagueRequestContext['league'],
  viewer: Viewer,
  gameId: string,
  ports: StaffNumbersPorts,
): Promise<StaffNumbersMore | null> {
  return ports.tracker.gameReadsOf(league.id, async ({ store, audience, policy }) => {
    const viewing = (who: Viewer) => ({ leagueId: league.id, viewer: who, audience, policy });
    const snapshot = await readGameSnapshot(
      store,
      { gameId },
      viewing(publicViewer(league.id)),
      ports.tracker.clock.now(),
      publicPlayerKey,
    );
    if (!snapshot.ok) return null;
    const everyone = await readGamePage(store, { gameId }, viewing(publicViewer(league.id)));
    const staff = await readGamePage(store, { gameId }, viewing(viewer));
    if (!everyone.ok || !staff.ok) return null;
    const beyond = staff.value.boxScores.filter(
      (box) =>
        box.playerLinesShown &&
        everyone.value.boxScores.find((other) => other.side === box.side)?.playerLinesShown ===
          false,
    );
    const sides = new Set(beyond.map((box) => box.side));
    // Each player line keyed by its place in its table, never the person's id (step 2.225).
    const boxScores = snapshot.value.status === 'final' ? buildBoxScores(staff.value) : null;
    // Only a game where the hidden team has a player line or a named play to show.
    const shownMore =
      (boxScores?.kind === 'tables' &&
        boxScores.tables.some(
          (table) => sides.has(table.side) && (table.players?.length ?? 0) > 0,
        )) ||
      staff.value.plays.some(
        (play) =>
          play.side !== null &&
          sides.has(play.side) &&
          (play.player !== null || play.playersIn.length > 0 || play.playersOut.length > 0),
      );
    if (!shownMore) return null;
    return {
      page: 'game',
      notice: noticeFor(beyond.map((box) => box.name)),
      view: gameNumbersView({
        boxScores,
        plays: buildPlays(staff.value, gameWords()),
        live: snapshot.value.status === 'live',
        selfAddress: leagueUrl(league, 'game', { game: gameId }),
      }),
    };
  });
}
