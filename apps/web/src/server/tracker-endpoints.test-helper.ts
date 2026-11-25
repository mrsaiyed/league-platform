// The tracker's endpoints over the web app's made-up stand-in, for their tests: the
// stand-in's leagues, people and games, a request made as one of them through one
// league's address, and a publisher that keeps what it was asked to publish.
import type { LeagueScoreMessage, LiveMessage } from '@srleagues/contracts';
import {
  applyTrackerCommands,
  getSeason,
  leagueApiUrl,
  openScoringSession,
  reopenGame,
  updateSeason,
  type AccessHolder,
} from '@srleagues/core';
import type { LivePublisher } from '@srleagues/providers';
import { commandContextOf, requestContext, type LeagueRequestContext } from './context.ts';
import { resolveLeagueApi } from './league-api.ts';
import { createPlayPublisher } from './publish-plays.ts';
import { standInPlayerId } from './stand-in-games.ts';
import { standInLeagues, standInPeople, standInPorts } from './stand-in-ports.ts';
import type { TrackerPorts } from './tracker-ports.ts';

const siteOrigin = 'http://localhost:3000';

const gameId = (n: number) => `01900000-0000-7000-8000-006a${n.toString(16).padStart(8, '0')}`;

/** The made-up games of the live league (stand-in-games.ts). */
export const games = {
  /** Lions v Tigers, scheduled, the scorekeeper's. */
  lionsTigers: gameId(1),
  /** Hawks v Bears, the scorekeeper's: the Bears show their numbers to staff only. */
  hawksBears: gameId(2),
  /** Bears v Lions, final. */
  decided: gameId(5),
  /** Lions v Tigers in a season still being set up: not there for the public. */
  draftSeason: gameId(6),
} as const;

/** Hawks are team 3 and Bears team 4 of the made-up rosters. */
export const hawks = [1, 2, 3, 4, 5].map((n) => standInPlayerId(3, n));
export const bears = [1, 2, 3, 4, 5].map((n) => standInPlayerId(4, n));
/** The Bears' sixth player, on the bench at tip-off. */
export const bearsBench = standInPlayerId(4, 6);
export const bearsNames = ['Sol', 'Tam', 'Uma', 'Vic', 'Wes', 'Xan', 'Bearsley'];
export const liveLeagueId = standInLeagues.live.id;

export type Person = keyof typeof standInPeople | 'visitor';
export type League = keyof typeof standInLeagues;

export type Published =
  | { readonly kind: 'game'; readonly leagueId: string; readonly message: LiveMessage }
  | { readonly kind: 'score'; readonly leagueId: string; readonly message: LeagueScoreMessage };

/**
 * The game's season keeps turnovers (S-93, step 2.241): the stand-in seasons keep the
 * standard set, so a turnover there is refused. Wraps what the endpoints' commands run on.
 */
export const keepingTurnovers = (deps: TrackerPorts['deps']): TrackerPorts['deps'] => ({
  ...deps,
  transaction: (context, work) =>
    deps.transaction(context, (tx) =>
      work({
        ...tx,
        games: {
          ...tx.games,
          findSeason: async (seasonId) => {
            const season = await tx.games.findSeason(seasonId);
            if (season === undefined) return undefined;
            const rules = { ...(season.rules as Record<string, unknown>), statistics: 'full' };
            return { ...season, rules };
          },
        },
      }),
    ),
});

export type TrackerWorldOptions = {
  /** Wraps what the endpoints' commands run on: a season's rules changed in a test, say. */
  readonly deps?: (deps: TrackerPorts['deps']) => TrackerPorts['deps'];
};

export function trackerWorld(options: TrackerWorldOptions = {}) {
  const ports = standInPorts({
    appEnv: 'test',
    publicBaseUrl: siteOrigin,
    log: () => {},
    emailFrom: 'scores@example.test',
  });
  const published: Published[] = [];
  const publisher: LivePublisher = {
    publishGame: async (leagueId, message) =>
      void published.push({ kind: 'game', leagueId, message }),
    publishLeagueScore: async (leagueId, message) =>
      void published.push({ kind: 'score', leagueId, message }),
  };
  const deps = options.deps?.(ports.tracker.deps) ?? ports.tracker.deps;
  const tracker: TrackerPorts = { ...ports.tracker, publisher, deps };
  const warnings: string[] = [];
  const publishPlays = createPlayPublisher({
    ...tracker,
    warn: (_message, fields) => void warnings.push(fields.reason),
  });

  /** The request as `person` through `league`'s address for this game endpoint. */
  async function contextAs(
    person: Person,
    league: League,
    parts: readonly string[],
  ): Promise<LeagueRequestContext> {
    const session = person === 'visitor' ? null : await ports.identify(standInPeople[person].token);
    const resolved = await resolveLeagueApi(
      {
        host: 'localhost:3000',
        path: leagueApiUrl({ id: standInLeagues[league].id }, parts),
        session,
      },
      parts,
      { ...ports, siteOrigin },
    );
    if (!resolved.ok) throw new Error(`no context: ${resolved.refusal.error}`);
    return resolved.context;
  }

  /**
   * The request as `person` through `league`'s address as an endpoint would see it if
   * the gate let it through: to test an endpoint's own refusal in a league hidden from
   * this person, which resolveLeagueApi already answers "not found" (step 2.223).
   */
  async function contextPastTheGate(
    person: Person,
    league: League,
    parts: readonly string[],
  ): Promise<LeagueRequestContext> {
    const session = person === 'visitor' ? null : await ports.identify(standInPeople[person].token);
    const path = leagueApiUrl({ id: standInLeagues[league].id }, parts);
    const built = await requestContext(
      { host: 'localhost:3000', path, session },
      { ...ports, siteOrigin },
    );
    if (!built.ok || built.value.kind !== 'league') throw new Error('no league');
    return built.value;
  }

  async function holderOf(context: LeagueRequestContext): Promise<AccessHolder | undefined> {
    return context.account === null
      ? undefined
      : ports.accessOf({
          leagueId: context.league.id,
          accountId: context.account.accountId,
          requestId: 'r',
        });
  }

  /** The owner's command context, as the server's session gives it. */
  const asOwner = async () => commandContextOf(await contextAs('owner', 'live', ['seasons']));

  /** The game as the server holds it now. */
  async function gameRecord(gameId: string) {
    const game = await tracker.deps.transaction(await asOwner(), (tx) => tx.games.find(gameId));
    if (game === undefined) throw new Error('no such game');
    return game;
  }

  /** The owner archives the game's season (O-12, step 2.130). */
  async function archiveSeasonOf(gameId: string) {
    const owner = await asOwner();
    const { seasonId } = await gameRecord(gameId);
    const season = await getSeason(owner, { seasonId }, ports.adminSettings.deps);
    if (!season.ok) throw new Error(season.error.code);
    const archived = await updateSeason(
      owner,
      { seasonId, version: season.value.version, status: 'completed' },
      ports.adminSettings.deps,
    );
    if (!archived.ok) throw new Error(archived.error.code);
  }

  /** The scorekeeper's tablet plays Hawks v Bears to the end: final. */
  async function tabletEndsHawksBears() {
    const gameId = games.hawksBears;
    const scorer = commandContextOf(await contextAs('scorekeeper', 'live', ['games', gameId]));
    const opened = await openScoringSession(scorer, { gameId, deviceId: 'tablet-1' }, tracker.deps);
    if (!opened.ok || opened.value.status !== 'held-by-you') throw new Error('not opened');
    const sent = await applyTrackerCommands(
      scorer,
      {
        gameId,
        protocolVersion: 2,
        sessionId: opened.value.sessionId,
        commands: [
          tap({ type: 'lineup', side: 'home', playerIds: hawks }),
          tap({ type: 'lineup', side: 'away', playerIds: bears }),
          tap({ type: 'start' }),
          tap({ type: 'score', side: 'home', playerId: hawks[0], points: 2 }),
          tap({ type: 'end' }),
        ],
      },
      tracker.deps,
    );
    if (!sent.ok || sent.value.results.some((r) => r.status !== 'accepted')) {
      throw new Error('not ended');
    }
    if ((await gameRecord(gameId)).status !== 'final') throw new Error('not final');
  }

  /** The owner reopens the game by a correction with a reason, and leaves it open (T-381). */
  async function reopenByCorrection(gameId: string) {
    const { version } = await gameRecord(gameId);
    const reopened = await reopenGame(
      await asOwner(),
      { gameId, version, reason: 'A basket was given to the wrong team' },
      tracker.deps,
    );
    if (!reopened.ok) throw new Error(reopened.error.code);
  }

  return {
    ports,
    tracker,
    published,
    warnings,
    publishPlays,
    contextAs,
    contextPastTheGate,
    holderOf,
    archiveSeasonOf,
    tabletEndsHawksBears,
    reopenByCorrection,
  };
}

let commandNumber = 0;
/** A tap with a fresh id, tapped now. */
export function tap(input: unknown, at = Date.now()) {
  commandNumber += 1;
  const commandId = `01900000-0000-7000-8000-00c0${commandNumber.toString(16).padStart(8, '0')}`;
  return { commandId, at, input };
}
