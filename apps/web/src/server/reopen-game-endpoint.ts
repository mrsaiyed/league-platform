// POST /api/v1/leagues/{leagueId}/games/{game}/reopen (step 2.120, S-36; record 060):
// the scorekeeper who tapped End game too soon reopens the game from the tracker, with
// a reason. A thin handler (T-25, T-26): who is asking and which league come from the
// context (T-23), the game from the address, and the body carries only `sequence`, the
// number of the last tap the device knows of (its End game, as the commands endpoint
// answered it), and `reason`. One command does the rest (games.reopen_tracked_game).
// The tracker's button is step 2.37's.
//
// Answers:
//
// - 200 `{ status: 'reopened', sequence, sentAt }`: the game is live again, and
//   `sequence` is the number of the reopen itself; the device opens the game again
//   through the session endpoint and carries on.
// - 401 signed-out and 400 invalid-input (not a reopening, or no sequence): the
//   contract's `TrackerRefusal`, as the other tracker endpoints answer.
// - `{ status: 'refused', code, sentAt }` at the code's own status otherwise. Each code
//   has its sentence in the message files, `error.games.reopen_tracked_game.<code>`;
//   the ones a scorekeeper meets once it is too late say an admin can reopen it.
//
// Once reopened, the game is published for the people watching (T-117): the route does
// that after answering.
import { trackerRefusalStatus, type TrackerRefusal } from '@srleagues/contracts';
import { reopenTrackedGame, type ReopenTrackedGameError } from '@srleagues/core';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { isGameIdFormat, type ApiAnswer } from './league-api.ts';
import type { CommandsOutcome, PublishPlays } from './tracker-commands-endpoint.ts';
import type { TrackerPorts } from './tracker-ports.ts';

/** Every refusal the endpoint answers, by code, with its HTTP status. */
export const reopenRefusalStatus = {
  'not-allowed': 403,
  'reason-needed': 400,
  'game-not-found': 404,
  'changed-since-read': 409,
  'game-not-decided': 409,
  'not-ended-by-tracker': 409,
  'scorekeepers-may-not-reopen': 403,
  'not-ended-by-you': 403,
  'reopen-time-over': 403,
} as const satisfies Readonly<
  Record<ReopenTrackedGameError['code'] | 'not-allowed' | 'reason-needed', number>
>;

export type ReopenRefusal = keyof typeof reopenRefusalStatus;

export type ReopenReply =
  | { readonly status: 'reopened'; readonly sequence: number; readonly sentAt: number }
  | { readonly status: 'refused'; readonly code: ReopenRefusal; readonly sentAt: number };

const done = (answer: ApiAnswer): CommandsOutcome => ({ answer, afterwards: null });

const turnedAway = (body: TrackerRefusal): CommandsOutcome =>
  done({ status: trackerRefusalStatus[body.error], body });

const refused = (code: ReopenRefusal, sentAt: number): CommandsOutcome =>
  done({
    status: reopenRefusalStatus[code],
    body: { status: 'refused', code, sentAt } satisfies ReopenReply,
  });

/** The command's own error codes, every one named, so a new one fails the type check here. */
const refusalOf = (code: ReopenTrackedGameError['code']): ReopenRefusal => {
  switch (code) {
    case 'game-not-found':
    case 'changed-since-read':
    case 'game-not-decided':
    case 'not-ended-by-tracker':
    case 'scorekeepers-may-not-reopen':
    case 'not-ended-by-you':
    case 'reopen-time-over':
      return code;
  }
};

export async function reopenTrackedGameRequest(
  context: LeagueRequestContext,
  game: string,
  /** The body as JSON, or undefined when it was not JSON. */
  body: unknown,
  ports: Pick<TrackerPorts, 'deps' | 'clock'>,
  publish: PublishPlays,
): Promise<CommandsOutcome> {
  if (context.account === null) return turnedAway({ error: 'signed-out' });
  if (!isGameIdFormat(game)) return refused('game-not-found', ports.clock.now());
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return turnedAway({ error: 'invalid-input', issues: [] });
  }
  const { sequence, reason } = body as { sequence?: unknown; reason?: unknown };
  // The address names the game; nothing else in the body is read.
  const result = await reopenTrackedGame(
    commandContextOf(context),
    { gameId: game, sequence, reason },
    ports.deps,
  );
  if (!result.ok) {
    const error = result.error;
    if (error.code === 'not-allowed') return refused('not-allowed', ports.clock.now());
    if (error.code === 'invalid-input') {
      if (error.issues.some((issue) => issue.path === 'reason')) {
        return refused('reason-needed', ports.clock.now());
      }
      return turnedAway({ error: 'invalid-input', issues: [...error.issues] });
    }
    return refused(refusalOf(error.code), ports.clock.now());
  }
  const leagueId = context.league.id;
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
