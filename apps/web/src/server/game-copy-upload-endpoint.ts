// POST /api/v1/leagues/{leagueId}/games/{game}/copy (S-5, T-129, step 2.70): a copy of a
// game, saved on the scoring device, uploaded from any phone or computer. Who is asking
// and which league come from the context (T-23), the game from the address; the body is
// only the file's text and, once asked, the takeover answer (game-copy.ts in contracts).
//
// The copy's commands go through the commands door the tracker uses
// (`sendTrackerCommands`, applyTrackerCommands), so whatever the server already has is
// answered `duplicate` and skipped, and nothing counts twice, in whatever order the copy
// and a tablet sending late arrive (T-361):
//
// 1. The door is asked first under a session that holds nothing: it saves nothing then,
//    and answers `duplicate` for every command the server has. A copy with nothing new
//    is answered at once, so a second upload changes nothing and a device scoring now
//    is not disturbed.
// 2. Otherwise the game's scoring session is taken as opening the game takes it
//    (openScoringSession, on a device of this upload's own): a game under way that
//    another device holds is answered `held-by-other`, and only the takeover question's
//    answer (S-42) takes it. A final game is refused "reopen it first" (T-362).
// 3. The new commands are sent in batches under that session, in the copy's order, and
//    the session is released at the end, so the tablet or anyone may open the game again.
//
// Answers: 200 `GameCopyUploadReply` (uploaded, held-by-other), its refusals at
// `gameCopyRefusalStatus`, and the contract's `TrackerRefusal` for signed out (401) or a
// body that is not an upload (400).
import { randomUUID } from 'node:crypto';
import {
  GameCopyUpload,
  gameCopyRefusalStatus,
  maxCommandsPerBatch,
  maxGameCopyLength,
  readGameCopy,
  trackerRefusalStatus,
  CommandReply,
  type GameCopyCommand,
  type GameCopyUploadRefusal,
  type GameCopyUploadReply,
  type TrackerRefusal,
} from '@srleagues/contracts';
import {
  openScoringSession,
  readTrackerState,
  releaseScoringSession,
  statisticOfTap,
  takeOverScoring,
  type ScoringSessionReply,
} from '@srleagues/core';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { isGameIdFormat } from './league-api.ts';
import { replyOf } from './scoring-session-endpoint.ts';
import {
  sendTrackerCommands,
  type CommandsOutcome,
  type PublishPlays,
} from './tracker-commands-endpoint.ts';
import type { TrackerPorts } from './tracker-ports.ts';

type UploadPorts = Pick<TrackerPorts, 'deps' | 'displayNameOf' | 'clock'>;

/** The most bytes an upload's body may hold: a copy of a long game and some room. */
export const maxCopyUploadBytes = 4 * 1024 * 1024;

const answer = (status: number, body: unknown): CommandsOutcome => ({
  answer: { status, body },
  afterwards: null,
});
const refused = (code: GameCopyUploadRefusal): CommandsOutcome =>
  answer(gameCopyRefusalStatus[code], { status: 'refused', code } satisfies GameCopyUploadReply);
const turnedAway = (body: TrackerRefusal): CommandsOutcome =>
  answer(trackerRefusalStatus[body.error], body);
/** A body or a copy too large to be one, answered so the page can say so (413). */
export const copyTooLarge = (): CommandsOutcome => answer(413, { error: 'too-large' });
const tooLong = (body: unknown): boolean => {
  const copy: unknown =
    typeof body === 'object' && body !== null && 'copy' in body ? body.copy : null;
  return typeof copy === 'string' && copy.length > maxGameCopyLength;
};

/** The copy's commands in batches the door takes: one protocol version each, in order. */
export function copyBatches(commands: readonly GameCopyCommand[]): GameCopyCommand[][] {
  const batches: GameCopyCommand[][] = [];
  for (const entry of commands) {
    const last = batches.at(-1);
    if (
      last !== undefined &&
      last.length < maxCommandsPerBatch &&
      last[0]?.protocolVersion === entry.protocolVersion
    ) {
      last.push(entry);
    } else {
      batches.push([entry]);
    }
  }
  return batches;
}

type DoorAnswer =
  | { readonly ok: true; readonly reply: CommandReply; readonly saved: boolean }
  | { readonly ok: false; readonly code: GameCopyUploadRefusal };

/** One batch through the tracker's own door, its answer read as the tracker reads it. */
async function throughTheDoor(
  context: LeagueRequestContext,
  game: string,
  sessionId: string,
  batch: readonly GameCopyCommand[],
  ports: UploadPorts,
  publish: PublishPlays,
): Promise<DoorAnswer> {
  const body = {
    protocolVersion: batch[0]?.protocolVersion ?? 0,
    sessionId,
    // Named so a play of a statistic the season does not keep is told apart (T-395).
    knownRefusals: ['statistic-not-kept' as const],
    commands: batch.map((c) => c.command),
  };
  const outcome = await sendTrackerCommands(context, game, body, ports, publish);
  const { status } = outcome.answer;
  if (status === 403) return { ok: false, code: 'not-allowed' };
  if (status === 404) return { ok: false, code: 'unknown-game' };
  // The game's season is archived (O-12, T-389): the door's own refusal, never `damaged`
  // (T-390).
  const said: unknown = outcome.answer.body;
  if (
    status === 409 &&
    typeof said === 'object' &&
    said !== null &&
    'error' in said &&
    said.error === 'season-archived'
  ) {
    return { ok: false, code: 'season-archived' };
  }
  const reply = CommandReply.safeParse(outcome.answer.body);
  // The reader checked every command against its version's shape: the door turning one
  // away whole means the copy is not as the door reads it.
  if (status !== 200 || !reply.success) return { ok: false, code: 'damaged' };
  return { ok: true, reply: reply.data, saved: outcome.afterwards !== null };
}

/** Opens the game for this upload as the tracker opens it, or takes it over once agreed. */
async function takeTheGame(
  context: LeagueRequestContext,
  game: string,
  takeOver: GameCopyUpload['takeOver'],
  ports: UploadPorts,
): Promise<
  | { readonly ok: true; readonly reply: ScoringSessionReply }
  | { readonly ok: false; readonly code: GameCopyUploadRefusal }
> {
  const command = commandContextOf(context);
  // A device of its own: never the session of a tracker open on the same device.
  const deviceId = `copy-upload-${randomUUID()}`;
  const opened = await openScoringSession(command, { gameId: game, deviceId }, ports.deps);
  const result =
    opened.ok && opened.value.status === 'held-by-other' && takeOver !== undefined
      ? await takeOverScoring(
          command,
          {
            gameId: game,
            deviceId,
            confirmed: true,
            expectedHolderSince: takeOver.expectedHolderSince,
          },
          ports.deps,
        )
      : opened;
  if (result.ok) return { ok: true, reply: result.value };
  switch (result.error.code) {
    case 'not-allowed':
      return { ok: false, code: 'not-allowed' };
    case 'game-not-found':
    case 'invalid-input':
      return { ok: false, code: 'unknown-game' };
    case 'game-closed':
      return { ok: false, code: 'reopen-first' };
    case 'game-postponed':
      return { ok: false, code: 'game-not-live' };
    case 'season-archived':
      return { ok: false, code: 'season-archived' };
  }
}

/**
 * Lets go of the upload's session. The plays are saved whatever happens here, so a release
 * that fails changes nothing of the answer: it is written down, and the session's lease
 * runs out by itself (T-371).
 */
async function letGo(
  context: LeagueRequestContext,
  game: string,
  sessionId: string,
  ports: UploadPorts,
): Promise<void> {
  const commandContext = commandContextOf(context);
  try {
    await releaseScoringSession(commandContext, { gameId: game, sessionId }, ports.deps);
  } catch {
    ports.deps.log({
      command: 'games.upload_game_copy',
      requestId: commandContext.requestId,
      leagueId: commandContext.leagueId,
      accountId: commandContext.accountId,
      durationMs: null,
      outcome: 'failed',
      errorCode: 'release-failed',
    });
  }
}

export async function uploadGameCopy(
  context: LeagueRequestContext,
  game: string,
  /** The body as JSON, or undefined when it was not JSON. */
  body: unknown,
  ports: UploadPorts,
  publish: PublishPlays,
): Promise<CommandsOutcome> {
  if (context.account === null) return turnedAway({ error: 'signed-out' });
  if (!isGameIdFormat(game)) return refused('unknown-game');
  const upload = GameCopyUpload.safeParse(body);
  if (!upload.success) {
    return tooLong(body) ? copyTooLarge() : turnedAway({ error: 'invalid-input', issues: [] });
  }
  const leagueId = context.league.id;
  const read = readGameCopy(upload.data.copy, { leagueId, gameId: game });
  if (!read.ok) return refused(read.problem);
  const { commands } = read.copy;
  const uploaded = (added: number, alreadyThere: number, notTaken: number) =>
    answer(200, {
      status: 'uploaded',
      added,
      alreadyThere,
      notTaken,
    } satisfies GameCopyUploadReply);

  if (commands.length === 0) {
    // Nothing to send, but only to someone who may score the game.
    const may = await readTrackerState(commandContextOf(context), { gameId: game }, ports.deps);
    if (!may.ok) return refused(may.error.code === 'not-allowed' ? 'not-allowed' : 'unknown-game');
    return uploaded(0, 0, 0);
  }

  // 1. What the server already has: the door saves nothing under a session it never gave.
  const known = new Set<string>();
  for (const batch of copyBatches(commands)) {
    const door = await throughTheDoor(context, game, randomUUID(), batch, ports, publish);
    if (!door.ok) return refused(door.code);
    for (const r of door.reply.results) {
      if (r.status === 'duplicate') known.add(r.commandId.toLowerCase());
    }
  }
  const fresh = commands.filter((c) => !known.has(c.command.commandId.toLowerCase()));
  if (fresh.length === 0) return uploaded(0, commands.length, 0);

  // 2. The game's scoring session, as opening the game takes it.
  const taken = await takeTheGame(context, game, upload.data.takeOver, ports);
  if (!taken.ok) return refused(taken.code);
  if (taken.reply.status !== 'held-by-you') {
    const told = await replyOf(leagueId, taken.reply, ports);
    // `ended` is never the answer to an opening; told as held, the page asks again.
    return told.status === 'held-by-other'
      ? answer(200, told satisfies GameCopyUploadReply)
      : refused('unknown-game');
  }
  const { sessionId } = taken.reply;

  // 3. The new commands under that session, then the session let go.
  let added = 0;
  let alreadyThere = commands.length - fresh.length;
  let notTaken = 0;
  const notKept = new Map<string, number>();
  let saved = false;
  try {
    for (const batch of copyBatches(fresh)) {
      const door = await throughTheDoor(context, game, sessionId, batch, ports, publish);
      if (!door.ok) {
        notTaken += batch.length;
        continue;
      }
      saved ||= door.saved;
      const typeOf = new Map(batch.map((c) => [c.command.commandId, c.command.input.type]));
      for (const r of door.reply.results) {
        if (r.status === 'accepted') added += 1;
        else if (r.status === 'duplicate') alreadyThere += 1;
        else if (r.reason.code === 'statistic-not-kept') {
          const statistic = statisticOfTap(typeOf.get(r.commandId) ?? '') ?? 'other';
          notKept.set(statistic, (notKept.get(statistic) ?? 0) + 1);
        } else notTaken += 1;
      }
    }
  } finally {
    await letGo(context, game, sessionId, ports);
  }
  const kept = [...notKept].map(([statistic, count]) => ({ statistic, count }));
  const reply: GameCopyUploadReply = {
    status: 'uploaded',
    added,
    alreadyThere,
    notTaken,
    ...(kept.length === 0 ? {} : { notKept: kept }),
  };
  return {
    answer: { status: 200, body: reply },
    afterwards: saved ? () => publish(leagueId, game) : null,
  };
}
