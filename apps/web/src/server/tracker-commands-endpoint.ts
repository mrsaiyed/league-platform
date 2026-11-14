// POST /api/v1/leagues/{leagueId}/games/{game}/commands (T6 §3, T-111, T-229): the
// tracker's taps, a few at a time. A thin handler (T-25, T-26): who is asking and which
// league come from the context (T-23), the game from the address, and the one command
// (applyTrackerCommands, step 2.29) does the rest. Its answers become HTTP as the
// tracker's queue reads them (features/tracker/fetch-command-transport.ts, record 024):
//
// - 200 with the reply: every command answered accepted, duplicate or refused, as the
//   protocol says, a session that no longer holds the game included (T-113, T-116).
// - 400 with the version refusal: a protocol version the server does not take (T-127).
// - 400 invalid-input: the body is not a batch. The queue then sends one tap at a time
//   to find the bad one.
// - 401 signed-out, 403 not-allowed, 404 not-found: the request is turned away whole
//   (no session; may not score this game; no such league or game, a game of another
//   league asked for through this one's address included). The queue halts.
//
// Once the batch is saved, its play is published for the people watching (T-117): the
// route does that after answering, so the tracker never waits on the live service.
import { buildVersionRefusal } from '@srleagues/contracts';
import { applyTrackerCommands } from '@srleagues/core';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { isGameIdFormat, type ApiAnswer } from './league-api.ts';
import type { TrackerPorts } from './tracker-ports.ts';

/** What the route does once it has answered: publish the game's new state, or nothing. */
export type CommandsOutcome = {
  readonly answer: ApiAnswer;
  readonly afterwards: (() => Promise<void>) | null;
};

export type PublishPlays = (leagueId: string, gameId: string) => Promise<void>;

const answer = (status: number, body: unknown): CommandsOutcome => ({
  answer: { status, body },
  afterwards: null,
});

export async function sendTrackerCommands(
  context: LeagueRequestContext,
  game: string,
  /** The body as JSON, or undefined when it was not JSON. */
  body: unknown,
  ports: Pick<TrackerPorts, 'deps'>,
  publish: PublishPlays,
): Promise<CommandsOutcome> {
  if (context.account === null) return answer(401, { error: 'signed-out' });
  if (!isGameIdFormat(game)) return answer(404, { error: 'not-found' });
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return answer(400, { error: 'invalid-input', issues: [] });
  }
  // The address names the game: anything the body says about it is put aside.
  const result = await applyTrackerCommands(
    commandContextOf(context),
    { ...body, gameId: game },
    ports.deps,
  );
  if (!result.ok) {
    const error = result.error;
    switch (error.code) {
      case 'not-allowed':
        return answer(403, { error: 'not-allowed' });
      case 'unsupported-protocol-version':
        return answer(400, { ...buildVersionRefusal(), accepted: [...error.accepted] });
      case 'invalid-input':
        return answer(400, { error: 'invalid-input', issues: error.issues });
    }
  }
  const reply = result.value;
  // No such game in this league: the whole batch is turned away, as for any address
  // that names nothing.
  const noGame = reply.results.every(
    (r) => r.status === 'refused' && r.reason.code === 'unknown-game',
  );
  if (noGame) return answer(404, { error: 'not-found' });
  const saved = reply.results.some((r) => r.status === 'accepted');
  const leagueId = context.league.id;
  return {
    answer: { status: 200, body: reply },
    afterwards: saved ? () => publish(leagueId, game) : null,
  };
}
