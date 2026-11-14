// POST /api/v1/leagues/{leagueId}/games/{game}/session (T6 §5, T-116; record 039):
// open, renew, take over or release this device's scoring session. One address for the
// four, as the contract's SessionRequest is one shape; each request runs exactly one
// command (T-25), with who and which league from the context (T-23) and the game from
// the address. Answers, in the contract's SessionReply shape:
//
// - 200: held by you, held by someone else (shown by name, never by account), or ended.
// - 401 signed-out; 400 invalid-input (not a session request).
// - 403 refused not-allowed: may not score this game.
// - 404 refused unknown-game: no such game in this league (one of another league asked
//   for through this one's address included).
// - 409 refused game-not-live: decided, cancelled or postponed; it cannot be scored now.
import { SessionRequest, type SessionReply } from '@srleagues/contracts';
import {
  openScoringSession,
  releaseScoringSession,
  renewScoringSession,
  takeOverScoring,
  type CommandContext,
  type ScoringSessionReply,
} from '@srleagues/core';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { isGameIdFormat, type ApiAnswer } from './league-api.ts';
import type { TrackerPorts } from './tracker-ports.ts';

type SessionPorts = Pick<TrackerPorts, 'deps' | 'displayNameOf' | 'clock'>;

type Refusal = Extract<SessionReply, { status: 'refused' }>['code'];

const refusedStatus: Readonly<Record<Refusal, number>> = {
  'not-allowed': 403,
  'unknown-game': 404,
  'game-not-live': 409,
};

const refused = (code: Refusal, sentAt: number): ApiAnswer => ({
  status: refusedStatus[code],
  body: { status: 'refused', code, sentAt } satisfies SessionReply,
});

/** The command's error codes as the tracker is told them. */
const refusalOf = (code: string): Refusal => {
  switch (code) {
    case 'game-not-found':
      return 'unknown-game';
    case 'game-closed':
    case 'game-postponed':
      return 'game-not-live';
    default:
      return 'not-allowed';
  }
};

/** Runs the one command the request asks for. */
function run(
  context: CommandContext,
  gameId: string,
  request: SessionRequest,
  ports: SessionPorts,
) {
  switch (request.type) {
    case 'open':
      return openScoringSession(context, { gameId, deviceId: request.deviceId }, ports.deps);
    case 'renew':
      return renewScoringSession(context, { gameId, sessionId: request.sessionId }, ports.deps);
    case 'take-over':
      return takeOverScoring(
        context,
        {
          gameId,
          deviceId: request.deviceId,
          confirmed: request.confirmed,
          expectedHolderSince: request.expectedHolderSince,
        },
        ports.deps,
      );
    case 'release':
      return releaseScoringSession(context, { gameId, sessionId: request.sessionId }, ports.deps);
  }
}

export async function scoringSessionRequest(
  context: LeagueRequestContext,
  game: string,
  /** The body as JSON, or undefined when it was not JSON. */
  body: unknown,
  ports: SessionPorts,
): Promise<ApiAnswer> {
  if (context.account === null) return { status: 401, body: { error: 'signed-out' } };
  if (!isGameIdFormat(game)) return refused('unknown-game', ports.clock.now());
  const request = SessionRequest.safeParse(body);
  if (!request.success) {
    const issues = request.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      problem: issue.code,
    }));
    return { status: 400, body: { error: 'invalid-input', issues } };
  }
  const result = await run(commandContextOf(context), game, request.data, ports);
  if (!result.ok) {
    if (result.error.code === 'invalid-input') {
      return { status: 400, body: { error: 'invalid-input', issues: result.error.issues } };
    }
    return refused(refusalOf(result.error.code), ports.clock.now());
  }
  return { status: 200, body: await replyOf(context.league.id, result.value, ports) };
}

async function replyOf(
  leagueId: string,
  reply: ScoringSessionReply,
  ports: SessionPorts,
): Promise<SessionReply> {
  if (reply.status !== 'held-by-other') return reply;
  const name = await ports.displayNameOf(leagueId, reply.holder.accountId);
  return {
    status: 'held-by-other',
    holder: { displayName: name.slice(0, 120), since: reply.holder.since },
    sentAt: reply.sentAt,
  };
}
