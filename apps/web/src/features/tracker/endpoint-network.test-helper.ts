// The real tracker endpoints, reached by the browser's own transports through a
// `fetch` that runs in this process: each request is answered by the endpoint's handler
// (apps/web/src/server) over the web app's made-up stand-in, as the person it is made
// for. The network can be down (nothing reaches the server) or lose answers (the server
// does the work, the answer never comes back).
import { trackerChangesHeader } from '@srleagues/contracts';
import { standInLeagues } from '../../server/stand-in-ports.ts';
import { markNotStartedRequest } from '../../server/not-started-endpoint.ts';
import { reopenOfferRequest, reopenTrackedGameRequest } from '../../server/reopen-game-endpoint.ts';
import { scoringSessionRequest } from '../../server/scoring-session-endpoint.ts';
import { sendTrackerCommands } from '../../server/tracker-commands-endpoint.ts';
import { trackerWorld, type Person } from '../../server/tracker-endpoints.test-helper.ts';
import { trackerRostersRequest } from '../../server/tracker-rosters-endpoint.ts';
import { trackerStateRequest } from '../../server/tracker-state-endpoint.ts';
import type { ApiAnswer } from '../../server/league-api.ts';
import type { TrackerPorts } from '../../server/tracker-ports.ts';

export type NetworkMode = 'up' | 'down' | 'answers-lost';

export type EndpointNetwork = {
  mode: NetworkMode;
  readonly world: ReturnType<typeof trackerWorld>;
  /** Every request that reached the server: method, last address part, and a session request's type. */
  readonly reached: string[];
  /** A `fetch` that is `person` signed in on their device. */
  fetchAs(person: Person): typeof globalThis.fetch;
};

const leagueKeyOf = (leagueId: string) => {
  const key = (Object.keys(standInLeagues) as (keyof typeof standInLeagues)[]).find(
    (k) => standInLeagues[k].id === leagueId,
  );
  if (key === undefined) throw new Error(`no stand-in league ${leagueId}`);
  return key;
};

export type EndpointNetworkOptions = {
  /** Wraps what the endpoints' commands run on: a season's rules changed in a test, say. */
  readonly deps?: (deps: TrackerPorts['deps']) => TrackerPorts['deps'];
};

export function endpointNetwork(options: EndpointNetworkOptions = {}): EndpointNetwork {
  const made = trackerWorld();
  const world = {
    ...made,
    tracker: { ...made.tracker, deps: options.deps?.(made.tracker.deps) ?? made.tracker.deps },
  };
  const reached: string[] = [];

  async function answer(person: Person, url: string, init: RequestInit | undefined) {
    const match =
      /^\/api\/v1\/leagues\/([^/]+)\/games\/([^/]+)\/(commands|session|state|rosters|reopen|not-started)$/.exec(
        url,
      );
    if (match === null) return { status: 404, body: { error: 'not-found' } };
    const [, leagueId = '', game = '', part = ''] = match;
    const body: unknown = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    const type = (body as { type?: unknown } | undefined)?.type;
    reached.push(`${init?.method ?? 'GET'} ${part}${typeof type === 'string' ? `:${type}` : ''}`);
    const context = await world.contextAs(person, leagueKeyOf(leagueId), ['games', game, part]);
    switch (part) {
      case 'commands': {
        const outcome = await sendTrackerCommands(
          context,
          game,
          body,
          world.tracker,
          world.publishPlays,
        );
        await outcome.afterwards?.();
        return outcome.answer;
      }
      case 'session':
        return scoringSessionRequest(context, game, body, world.tracker);
      // The scoring screen's two doors (step 2.37; game-doors.ts).
      case 'reopen': {
        if (init?.method !== 'POST') return reopenOfferRequest(context, game, world.tracker);
        const outcome = await reopenTrackedGameRequest(
          context,
          game,
          body,
          world.tracker,
          world.publishPlays,
        );
        await outcome.afterwards?.();
        return outcome.answer;
      }
      case 'not-started': {
        const outcome = await markNotStartedRequest(
          context,
          game,
          body,
          world.tracker,
          world.publishPlays,
        );
        await outcome.afterwards?.();
        return outcome.answer;
      }
      case 'rosters':
        return trackerRostersRequest(context, game, world.tracker);
      default: {
        // The tracker of this release asks for the changes of players too (T-356).
        const asked = new Headers(init?.headers).get(trackerChangesHeader) === '1';
        return trackerStateRequest(context, game, world.tracker, asked);
      }
    }
  }

  const network: EndpointNetwork = {
    mode: 'up',
    world,
    reached,
    fetchAs(person) {
      return (async (input: string | URL | Request, init?: RequestInit) => {
        if (network.mode === 'down') throw new TypeError('Failed to fetch');
        const done: ApiAnswer = await answer(person, String(input), init);
        if (network.mode === 'answers-lost') throw new TypeError('Failed to fetch');
        return new Response(JSON.stringify(done.body), {
          status: done.status,
          headers: { 'content-type': 'application/json', ...done.headers },
        });
      }) as typeof globalThis.fetch;
    },
  };
  return network;
}
