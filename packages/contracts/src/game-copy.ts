// "A copy of the game" (S-5, T-129, step 2.70): the file "Save a copy" writes on the
// scoring device, and the upload page sends from any phone or computer. It holds the
// game's commands exactly as the tracker's queue sends them, each with its own ID, so
// the server's commands door skips whatever it already has and nothing counts twice.
//
// What the file holds (T-360): which league and game it is for, when it was saved, and
// each command with the protocol version it was made under. Nothing else: no account,
// no session, no device. A command holds only what the tracker sends anyway: player
// IDs, jersey numbers, the time of the tap, and the name typed for a player added at the
// scorer's table (record 058). No other name or private field of a person is written.
import { z } from 'zod';
import {
  BatchCommand,
  isAcceptedProtocolVersion,
  SessionHolder,
  TrackerCommandV1,
} from './tracker-protocol.ts';

/** The mark that tells a copy of a game from any other file. */
export const gameCopyFormat = 'game-copy';

/** The version of the file's shape this release writes and reads. */
export const gameCopyVersion = 1;

/** The most commands one copy holds: far more than any game is tapped. */
export const maxCommandsPerCopy = 5000;

/** The most characters a copy's text may have, so a wrong file is refused before it is read. */
export const maxGameCopyLength = 2_000_000;

const Id = z.uuid();

/** One command as the tracker's queue keeps it: sent under the version it was made with (T-127). */
export type GameCopyCommand = {
  readonly protocolVersion: number;
  readonly command: BatchCommand;
};

export type GameCopy = {
  readonly format: typeof gameCopyFormat;
  readonly version: typeof gameCopyVersion;
  readonly leagueId: string;
  readonly gameId: string;
  /** When it was saved, in the device's milliseconds. */
  readonly savedAt: number;
  readonly commands: readonly GameCopyCommand[];
};

/** Why a file is not taken as a copy of this game: a fixed code the page words (T-187). */
export const gameCopyProblems = [
  /** Not a copy of a game at all. */
  'not-a-copy',
  /** A copy, but cut short or changed: it cannot be read as it is. */
  'damaged',
  /** A copy written by a newer or unknown release. */
  'unknown-version',
  /** A copy of a game of another league. */
  'other-league',
  /** A copy of another game. */
  'other-game',
] as const;
export type GameCopyProblem = (typeof gameCopyProblems)[number];

export type ReadGameCopyResult =
  | { readonly ok: true; readonly copy: GameCopy }
  | { readonly ok: false; readonly problem: GameCopyProblem };

const Envelope = z.looseObject({ format: z.literal(gameCopyFormat), version: z.unknown() });

const CopyV1 = z.strictObject({
  format: z.literal(gameCopyFormat),
  version: z.literal(1),
  leagueId: Id,
  gameId: Id,
  savedAt: z.number().int().nonnegative(),
  commands: z
    .array(z.strictObject({ protocolVersion: z.number().int().min(1), command: z.unknown() }))
    .max(maxCommandsPerCopy),
});

/** Writes the copy's text: what the device saves as the file. */
export function writeGameCopy(copy: Omit<GameCopy, 'format' | 'version'>): string {
  const whole: GameCopy = {
    format: gameCopyFormat,
    version: gameCopyVersion,
    leagueId: copy.leagueId,
    gameId: copy.gameId,
    savedAt: copy.savedAt,
    commands: copy.commands.map((c) => ({
      protocolVersion: c.protocolVersion,
      command: c.command,
    })),
  };
  return JSON.stringify(whole);
}

/**
 * Reads and checks a copy's text for the game it is uploaded to. Every command is
 * checked against the shape of the protocol version it names, as the commands door
 * will read it; a command ID twice is a damaged file.
 */
export function readGameCopy(
  text: string,
  expected: { readonly leagueId: string; readonly gameId: string },
): ReadGameCopyResult {
  const refuse = (problem: GameCopyProblem): ReadGameCopyResult => ({ ok: false, problem });
  if (text.length > maxGameCopyLength) return refuse('not-a-copy');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // A file cut short reads as broken JSON; any other file is not a copy.
    return refuse(
      text.trimStart().startsWith(`{"format":"${gameCopyFormat}"`) ? 'damaged' : 'not-a-copy',
    );
  }
  const envelope = Envelope.safeParse(data);
  if (!envelope.success) return refuse('not-a-copy');
  if (envelope.data.version !== gameCopyVersion) {
    return refuse(typeof envelope.data.version === 'number' ? 'unknown-version' : 'damaged');
  }
  const parsed = CopyV1.safeParse(data);
  if (!parsed.success) return refuse('damaged');
  const copy = parsed.data;
  if (copy.leagueId.toLowerCase() !== expected.leagueId.toLowerCase())
    return refuse('other-league');
  if (copy.gameId.toLowerCase() !== expected.gameId.toLowerCase()) return refuse('other-game');
  const commands: GameCopyCommand[] = [];
  const seen = new Set<string>();
  for (const entry of copy.commands) {
    if (!isAcceptedProtocolVersion(entry.protocolVersion)) return refuse('unknown-version');
    const shape = entry.protocolVersion === 1 ? TrackerCommandV1 : BatchCommand;
    const command = shape.safeParse(entry.command);
    if (!command.success) return refuse('damaged');
    const id = command.data.commandId.toLowerCase();
    if (seen.has(id)) return refuse('damaged');
    seen.add(id);
    commands.push({ protocolVersion: entry.protocolVersion, command: command.data });
  }
  return {
    ok: true,
    copy: { ...copy, format: gameCopyFormat, version: gameCopyVersion, commands },
  };
}

// ---------------------------------------------------------------- the upload (step 2.70)

/**
 * What the upload page posts to `POST /api/v1/leagues/{leagueId}/games/{game}/copy`: the
 * file's text as it is (the server reads and checks it itself), and, once the person has
 * answered the takeover question, the holder they agreed to take the game from (S-42).
 */
export const GameCopyUpload = z.strictObject({
  copy: z.string().max(maxGameCopyLength),
  takeOver: z.strictObject({ expectedHolderSince: z.number().int().nonnegative() }).optional(),
});
export type GameCopyUpload = z.infer<typeof GameCopyUpload>;

/** Why an upload was turned away, besides the file's own problems. */
export const gameCopyUploadRefusals = [
  ...gameCopyProblems,
  'not-allowed',
  'unknown-game',
  /** The game is final (or called off): reopen it first, then upload again. */
  'reopen-first',
  /** Postponed: it cannot be scored now. */
  'game-not-live',
  /**
   * Its season is archived (O-12, T-389): only someone who may correct games, through a
   * correction left open on it, uploads, as the tracker's own door says.
   */
  'season-archived',
] as const;
export type GameCopyUploadRefusal = (typeof gameCopyUploadRefusals)[number];

/** The HTTP status of each refusal. */
export const gameCopyRefusalStatus: Readonly<Record<GameCopyUploadRefusal, number>> = {
  'not-a-copy': 422,
  damaged: 422,
  'unknown-version': 422,
  'other-league': 422,
  'other-game': 422,
  'not-allowed': 403,
  'unknown-game': 404,
  'reopen-first': 409,
  'game-not-live': 409,
  'season-archived': 409,
};

/**
 * Plays of one statistic the season does not keep ("Statistics kept", S-93), not taken
 * (T-395): counted apart from `notTaken`, so the page can name the statistic and the setting.
 */
export const GameCopyNotKept = z.strictObject({
  statistic: z.string().min(1).max(40),
  count: z.number().int().positive(),
});
export type GameCopyNotKept = z.infer<typeof GameCopyNotKept>;

export const GameCopyUploadReply = z.discriminatedUnion('status', [
  /**
   * Sent through the commands door: `added` were new, `alreadyThere` the server had
   * (skipped), `notTaken` refused by the game's rules or because another device took the
   * game while the copy was being sent; `notKept`, present only when there are some, the
   * plays of a statistic the season does not keep, by statistic (T-395). A second upload
   * of the same file adds nothing.
   */
  z.strictObject({
    status: z.literal('uploaded'),
    added: z.number().int().nonnegative(),
    alreadyThere: z.number().int().nonnegative(),
    notTaken: z.number().int().nonnegative(),
    notKept: z.array(GameCopyNotKept).min(1).max(20).optional(),
  }),
  /** Another device holds the game: the page asks the takeover question, then posts again. */
  z.strictObject({
    status: z.literal('held-by-other'),
    holder: SessionHolder,
    sentAt: z.number().int().nonnegative(),
  }),
  z.strictObject({ status: z.literal('refused'), code: z.enum(gameCopyUploadRefusals) }),
]);
export type GameCopyUploadReply = z.infer<typeof GameCopyUploadReply>;
