// GET and PUT /api/v1/leagues/{leagueId}/games/{game}/format (step 2.119; P7 §5.1, S-35,
// S-39): one game's own format, read by the tracker's start confirmation and the admin's
// games area, given or taken away by them. Thin handlers (T-25, T-26): who and which
// league from the context (T-23), never the body; the game from the address; the read
// (games.read_game_format) and the two commands (games.give_game_format,
// games.clear_game_format) do the rest. Answers, in the contract's `GameFormatReply` at
// `gameFormatStatus`:
//
// - 200 format: the format as it stands; after a change, as it stands now.
// - 403 refused not-allowed: neither manages the league's games nor scores this game.
// - 404 refused unknown-game: no such game in this league, one of another league asked
//   for through this one's address included.
// - 409 refused, with its code: changed since it was read, the league's setting off for
//   scorekeepers, or the game under way (B3).
// - 401 signed-out and 400 invalid-input carry the tracker's `TrackerRefusal`.
import {
  GameFormatChangeRequest,
  gameFormatStatus,
  trackerRefusalStatus,
  type GameFormatRefusal,
  type GameFormatReply,
  type TrackerRefusal,
} from '@srleagues/contracts';
import {
  clearGameFormat,
  giveGameFormat,
  readGameFormat,
  type ClearGameFormatError,
  type GiveGameFormatError,
  type ReadGameFormatError,
} from '@srleagues/core';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { isGameIdFormat, type ApiAnswer } from './league-api.ts';
import type { TrackerPorts } from './tracker-ports.ts';

type FormatPorts = Pick<TrackerPorts, 'deps' | 'clock'>;

type Failed =
  | ReadGameFormatError
  | GiveGameFormatError
  | ClearGameFormatError
  | { readonly code: 'not-allowed' }
  | {
      readonly code: 'invalid-input';
      readonly issues: readonly { readonly path: string; readonly problem: string }[];
    };

const turnedAway = (body: TrackerRefusal): ApiAnswer => ({
  status: trackerRefusalStatus[body.error],
  body,
});

const answer = (reply: GameFormatReply): ApiAnswer => ({
  status: gameFormatStatus(reply),
  body: reply,
});

/**
 * The commands' codes as the contract names them. Every code but the missing game's is the
 * contract's own, so a code a command gains later fails the type check here.
 */
const refusalOf = (code: Exclude<Failed['code'], 'invalid-input'>): GameFormatRefusal =>
  code === 'game-not-found' ? 'unknown-game' : code;

function refused(error: Failed, sentAt: number): ApiAnswer {
  if (error.code === 'invalid-input') {
    return turnedAway({ error: 'invalid-input', issues: [...error.issues] });
  }
  return answer({ status: 'refused', code: refusalOf(error.code), sentAt });
}

async function formatNow(
  context: LeagueRequestContext,
  game: string,
  ports: FormatPorts,
): Promise<ApiAnswer> {
  const result = await readGameFormat(commandContextOf(context), { gameId: game }, ports.deps);
  const sentAt = ports.clock.now();
  if (!result.ok) return refused(result.error, sentAt);
  return answer({ status: 'format', view: result.value, sentAt });
}

export async function readGameFormatRequest(
  context: LeagueRequestContext,
  game: string,
  ports: FormatPorts,
): Promise<ApiAnswer> {
  if (context.account === null) return turnedAway({ error: 'signed-out' });
  if (!isGameIdFormat(game)) {
    return answer({ status: 'refused', code: 'unknown-game', sentAt: ports.clock.now() });
  }
  return formatNow(context, game, ports);
}

export async function changeGameFormatRequest(
  context: LeagueRequestContext,
  game: string,
  /** The body as JSON, or undefined when it was not JSON. */
  body: unknown,
  ports: FormatPorts,
): Promise<ApiAnswer> {
  if (context.account === null) return turnedAway({ error: 'signed-out' });
  if (!isGameIdFormat(game)) {
    return answer({ status: 'refused', code: 'unknown-game', sentAt: ports.clock.now() });
  }
  const request = GameFormatChangeRequest.safeParse(body);
  if (!request.success) {
    const issues = request.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      problem: issue.code,
    }));
    return turnedAway({ error: 'invalid-input', issues });
  }
  const { version, format } = request.data;
  const commandContext = commandContextOf(context);
  const result =
    format === null
      ? await clearGameFormat(commandContext, { gameId: game, version }, ports.deps)
      : await giveGameFormat(commandContext, { gameId: game, version, format }, ports.deps);
  if (!result.ok) return refused(result.error, ports.clock.now());
  return formatNow(context, game, ports);
}
