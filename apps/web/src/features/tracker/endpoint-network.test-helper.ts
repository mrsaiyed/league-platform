// The real tracker endpoints, reached by the browser's own transports through a
// `fetch` that runs in this process: each request is answered by the endpoint's handler
// (apps/web/src/server) over the web app's made-up stand-in, as the person it is made
// for. The network can be down (nothing reaches the server) or lose answers (the server
// does the work, the answer never comes back).
import { standInLeagues } from '../../server/stand-in-ports.ts';
import { scoringSessionRequest } from '../../server/scoring-session-endpoint.ts';
import { sendTrackerCommands } from '../../server/tracker-commands-endpoint.ts';
import { trackerWorld, type Person } from '../../server/tracker-endpoints.test-helper.ts';
import { trackerStateRequest } from '../../server/tracker-state-endpoint.ts';
import type { ApiAnswer } from '../../server/league-api.ts';

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

export function endpointNetwork(): EndpointNetwork {
  const world = trackerWorld();
  const reached: string[] = [];

  async function answer(person: Person, url: string, init: RequestInit | undefined) {
    const match = /^\/api\/v1\/leagues\/([^/]+)\/games\/([^/]+)\/(commands|session|state)$/.exec(
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
      default:
        return trackerStateRequest(context, game, world.tracker);
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
