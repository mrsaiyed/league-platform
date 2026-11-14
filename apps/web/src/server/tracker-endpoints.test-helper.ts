// The tracker's endpoints over the web app's made-up stand-in, for their tests: the
// stand-in's leagues, people and games, a request made as one of them through one
// league's address, and a publisher that keeps what it was asked to publish.
import type { LeagueScoreMessage, LiveMessage } from '@srleagues/contracts';
import { leagueApiUrl, type AccessHolder } from '@srleagues/core';
import type { LivePublisher } from '@srleagues/providers';
import type { LeagueRequestContext } from './context.ts';
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

export function trackerWorld() {
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
  const tracker: TrackerPorts = { ...ports.tracker, publisher };
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

  async function holderOf(context: LeagueRequestContext): Promise<AccessHolder | undefined> {
    return context.account === null
      ? undefined
      : ports.accessOf({
          leagueId: context.league.id,
          accountId: context.account.accountId,
          requestId: 'r',
        });
  }

  return { ports, tracker, published, warnings, publishPlays, contextAs, holderOf };
}

let commandNumber = 0;
/** A tap with a fresh id, tapped now. */
export function tap(input: unknown, at = Date.now()) {
  commandNumber += 1;
  const commandId = `01900000-0000-7000-8000-00c0${commandNumber.toString(16).padStart(8, '0')}`;
  return { commandId, at, input };
}
