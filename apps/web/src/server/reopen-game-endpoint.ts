// /api/v1/leagues/{leagueId}/games/{game}/reopen (step 2.120, S-36; record 060, T-263):
// the scorekeeper who tapped End game too soon reopens the game from the tracker. Thin
// handlers (T-25, T-26): who is asking and which league come from the context (T-23),
// the game from the address, and one command or read does the rest. The shapes are the
// contract's (packages/contracts/src/reopen-game.ts); the tracker's button is step 2.37's.
//
// - GET (games.read_reopen_offer): 200 `ReopenOffer`: Reopen offered always, until a
//   server time, or not with the reason, and who ended the game by name. 401, 403 and
//   404 are the contract's `TrackerRefusal`, as the state endpoint answers.
// - POST (games.reopen_tracked_game) takes a `ReopenRequest`: 200 `reopened`, or
//   `refused` with its code at `reopenRefusalStatus` (with who ended it, by name, when
//   that is the reason). 401 and 400 (not a reopen request) are the `TrackerRefusal`.
//   A missing or blank reason is `reason-needed`. Once reopened, the game is published
//   for the people watching (T-117), after the answer.
//
// Names are what another scorekeeper is shown of an account (`displayNameOf`), never
// the account id.
import {
  ReopenRequest,
  reopenRefusalStatus,
  trackerRefusalStatus,
  type ReopenOffer,
  type ReopenRefusalCode,
  type ReopenReply,
  type TrackerRefusal,
} from '@srleagues/contracts';
import { readReopenOffer, reopenTrackedGame, type ReopenTrackedGameError } from '@srleagues/core';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { isGameIdFormat, type ApiAnswer } from './league-api.ts';
import type { CommandsOutcome, PublishPlays } from './tracker-commands-endpoint.ts';
import type { TrackerPorts } from './tracker-ports.ts';

type ReopenPorts = Pick<TrackerPorts, 'deps' | 'clock' | 'displayNameOf'>;

const done = (answer: ApiAnswer): CommandsOutcome => ({ answer, afterwards: null });

const turnedAway = (body: TrackerRefusal): ApiAnswer => ({
  status: trackerRefusalStatus[body.error],
  body,
});

/** Who ended the game, by name; null when no account is known. */
async function endedByName(
  leagueId: string,
  accountId: string | null | undefined,
  ports: ReopenPorts,
): Promise<{ displayName: string } | null> {
  if (accountId === null || accountId === undefined) return null;
  return { displayName: (await ports.displayNameOf(leagueId, accountId)).slice(0, 120) };
}

/** The command's own error codes, every one named, so a new one fails the type check here. */
const refusalOf = (code: ReopenTrackedGameError['code']): ReopenRefusalCode => {
  switch (code) {
    case 'game-not-found':
    case 'changed-since-read':
    case 'game-not-decided':
    case 'not-ended-by-tracker':
    case 'scorekeepers-may-not-reopen':
    case 'not-ended-by-you':
    case 'reopen-time-over':
    case 'result-overturned':
      return code;
  }
};

export async function reopenTrackedGameRequest(
  context: LeagueRequestContext,
  game: string,
  /** The body as JSON, or undefined when it was not JSON. */
  body: unknown,
  ports: ReopenPorts,
  publish: PublishPlays,
): Promise<CommandsOutcome> {
  const leagueId = context.league.id;
  const refused = async (
    code: ReopenRefusalCode,
    endedBy: string | null = null,
  ): Promise<CommandsOutcome> =>
    done({
      status: reopenRefusalStatus[code],
      body: {
        status: 'refused',
        code,
        endedBy: await endedByName(leagueId, endedBy, ports),
        sentAt: ports.clock.now(),
      } satisfies ReopenReply,
    });
  if (context.account === null) return done(turnedAway({ error: 'signed-out' }));
  if (!isGameIdFormat(game)) return refused('game-not-found');
  const request = ReopenRequest.safeParse(body);
  if (!request.success) {
    if (request.error.issues.some((issue) => issue.path[0] === 'reason')) {
      return refused('reason-needed');
    }
    const issues = request.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      problem: issue.code,
    }));
    return done(turnedAway({ error: 'invalid-input', issues }));
  }
  // The address names the game; nothing else in the body is read.
  const result = await reopenTrackedGame(
    commandContextOf(context),
    { gameId: game, ...request.data },
    ports.deps,
  );
  if (!result.ok) {
    const error = result.error;
    if (error.code === 'not-allowed') return refused('not-allowed');
    if (error.code === 'invalid-input') {
      return done(turnedAway({ error: 'invalid-input', issues: [...error.issues] }));
    }
    return refused(refusalOf(error.code), 'endedBy' in error ? error.endedBy : null);
  }
  return {
    answer: {
      status: 200,
      body: {
        status: 'reopened',
        sequence: result.value.sequence,
        sentAt: ports.clock.now(),
      } satisfies ReopenReply,
    },
    afterwards: () => publish(leagueId, game),
  };
}

export async function reopenOfferRequest(
  context: LeagueRequestContext,
  game: string,
  ports: ReopenPorts,
): Promise<ApiAnswer> {
  if (context.account === null) return turnedAway({ error: 'signed-out' });
  if (!isGameIdFormat(game)) return turnedAway({ error: 'not-found' });
  const result = await readReopenOffer(commandContextOf(context), { gameId: game }, ports.deps);
  if (!result.ok) {
    switch (result.error.code) {
      case 'not-allowed':
        return turnedAway({ error: 'not-allowed' });
      case 'game-not-found':
        return turnedAway({ error: 'not-found' });
      case 'invalid-input':
        return turnedAway({ error: 'invalid-input', issues: [...result.error.issues] });
    }
  }
  const offer = result.value;
  return {
    status: 200,
    body: {
      reopen: offer.reopen,
      endedBy: await endedByName(context.league.id, offer.endedBy, ports),
      sentAt: ports.clock.now(),
    } satisfies ReopenOffer,
  };
}
