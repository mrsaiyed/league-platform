// POST /api/v1/leagues/{leagueId}/games/{game}/not-started (step 2.121; S-40; record
// 061, T-264): mark a game that went live by mistake "not started". A thin handler
// (T-25, T-26): who and which league from the context (T-23), the game from the
// address, and the one command (games.mark_not_started) does the rest. Answers, in the
// contract's `NotStartedReply` at `notStartedStatus`:
//
// - 200 not-started: the game is scheduled again, with the marker's sequence number.
// - 403 refused not-allowed: may not score this game, or a basket, foul or turnover
//   stands and the person may not correct games.
// - 404 refused unknown-game: no such game in this league, one of another league asked
//   for through this one's address included.
// - 409 refused, with its code: not started yet, final, entered by hand, postponed,
//   cancelled, no tracker plays, moved on since it was seen, held by another device,
//   or a reason needed.
// - 401 signed-out and 400 invalid-input carry the tracker's `TrackerRefusal`.
//
// Once it is done, the game's message goes out for the people watching (T-117), as for
// a batch of taps: the route does that after answering, so open pages stop saying Live.
import {
  NotStartedRequest,
  notStartedStatus,
  trackerRefusalStatus,
  type NotStartedRefusal,
  type NotStartedReply,
  type TrackerRefusal,
} from '@srleagues/contracts';
import { markNotStarted, type MarkNotStartedError } from '@srleagues/core';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { isGameIdFormat, type ApiAnswer } from './league-api.ts';
import type { CommandsOutcome, PublishPlays } from './tracker-commands-endpoint.ts';
import type { TrackerPorts } from './tracker-ports.ts';

const answer = (reply: NotStartedReply): CommandsOutcome => ({
  answer: { status: notStartedStatus(reply), body: reply },
  afterwards: null,
});

/** Signed out, or not a request: the tracker's own refusal at its own status. */
const turnedAway = (body: TrackerRefusal): CommandsOutcome => ({
  answer: { status: trackerRefusalStatus[body.error], body } satisfies ApiAnswer,
  afterwards: null,
});

/**
 * The command's codes as the contract names them. Every code but the missing game's is
 * the contract's own, so a code the command gains later fails the type check here.
 */
const refusalOf = (code: MarkNotStartedError['code'] | 'not-allowed'): NotStartedRefusal =>
  code === 'game-not-found' ? 'unknown-game' : code;

export async function markNotStartedRequest(
  context: LeagueRequestContext,
  game: string,
  /** The body as JSON, or undefined when it was not JSON. */
  body: unknown,
  ports: Pick<TrackerPorts, 'deps' | 'clock'>,
  publish: PublishPlays,
): Promise<CommandsOutcome> {
  if (context.account === null) return turnedAway({ error: 'signed-out' });
  const sentAt = () => ports.clock.now();
  if (!isGameIdFormat(game)) {
    return answer({ status: 'refused', code: 'unknown-game', sentAt: sentAt() });
  }
  const request = NotStartedRequest.safeParse(body);
  if (!request.success) {
    const issues = request.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      problem: issue.code,
    }));
    return turnedAway({ error: 'invalid-input', issues });
  }
  const result = await markNotStarted(
    commandContextOf(context),
    { ...request.data, gameId: game },
    ports.deps,
  );
  if (!result.ok) {
    if (result.error.code === 'invalid-input') {
      return turnedAway({ error: 'invalid-input', issues: [...result.error.issues] });
    }
    return answer({ status: 'refused', code: refusalOf(result.error.code), sentAt: sentAt() });
  }
  const leagueId = context.league.id;
  return {
    answer: {
      status: 200,
      body: {
        status: 'not-started',
        sequence: result.value.sequence,
        sentAt: sentAt(),
      } satisfies NotStartedReply,
    },
    afterwards: () => publish(leagueId, game),
  };
}
