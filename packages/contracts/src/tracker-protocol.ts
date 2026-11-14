// The tracker's door (T6 §3, §5, §6; T-111, T-113, T-116, T-117, T-118, T-121, T-127):
// the shapes that cross between the tracker, the server and the people watching.
// The commands themselves are the ones in live-stats.ts, reused as they are.
import { z } from 'zod';
import { Envelope, Jersey } from './live-stats.ts';

const Side = z.enum(['home', 'away']);
const Id = z.uuid();
const Ms = z.number().int().nonnegative();

// ---------------------------------------------------------------- version (T-127)

/** The protocol the current tracker speaks. It goes up when the shapes below change. */
export const trackerProtocolVersion = 1;

/**
 * T-127: the server takes the current version and the one before it, so a tracker
 * that was open before a release keeps working until the device is free to update.
 */
export const isAcceptedProtocolVersion = (
  version: number,
  current: number = trackerProtocolVersion,
): boolean =>
  Number.isInteger(version) && version >= 1 && (version === current || version === current - 1);

/**
 * Read this first, before any other schema: a body from a tracker on another version
 * may not match the current shapes at all, so only `protocolVersion` is looked at. A
 * version that fails here, or is not accepted, gets a `VersionRefusal`.
 *
 * When `trackerProtocolVersion` goes up, the previous version's shapes must be kept
 * (as a separate schema the server still parses with), because T-127 promises that
 * version keeps working.
 */
export const ProtocolProbe = z.looseObject({ protocolVersion: z.number().int().min(1) });
export type ProtocolProbe = z.infer<typeof ProtocolProbe>;

/** The refusal for a version the server does not take, listing the ones it does (T-127). */
export const buildVersionRefusal = (current: number = trackerProtocolVersion): VersionRefusal => ({
  error: 'unsupported-protocol-version',
  accepted: current > 1 ? [current - 1, current] : [current],
});

// ---------------------------------------------------------------- the batch (T-111)

/** The most commands in one batch: "a few at a time". */
export const maxCommandsPerBatch = 50;

/** One tap as sent: the scorer action with its ID and the moment it was tapped. */
export const TrackerCommand = Envelope.required({ at: true });
export type TrackerCommand = z.infer<typeof TrackerCommand>;

/** What the tracker posts to `POST /api/v1/leagues/{leagueId}/games/{game}/commands` (T-229). */
export const CommandBatch = z.strictObject({
  protocolVersion: z.number().int().min(1),
  sessionId: Id,
  commands: z
    .array(TrackerCommand)
    .min(1)
    .max(maxCommandsPerBatch)
    .refine((list) => new Set(list.map((c) => c.commandId)).size === list.length, {
      message: 'A command ID appears twice in the batch.',
    }),
});
export type CommandBatch = z.infer<typeof CommandBatch>;

/**
 * Why a command was refused (T-113). The tracker reloads the server's state and tells
 * the scorekeeper what was not applied; `message` is for the log, not for the screen.
 */
export const refusalCodes = [
  'rule', // the engine said no: a foul on a player not on the court, and the like
  'session-not-held', // the device no longer holds the game (T-116)
  'game-not-live', // the game has not started, or is final
  'unknown-game',
  'not-allowed', // the person may not score this game
] as const;
export const RefusalCode = z.enum(refusalCodes);
export type RefusalCode = z.infer<typeof RefusalCode>;

export const CommandResult = z.discriminatedUnion('status', [
  z.strictObject({ commandId: Id, status: z.literal('accepted') }),
  z.strictObject({ commandId: Id, status: z.literal('duplicate') }),
  z.strictObject({
    commandId: Id,
    status: z.literal('refused'),
    reason: z.strictObject({ code: RefusalCode, message: z.string().max(300) }),
  }),
]);
export type CommandResult = z.infer<typeof CommandResult>;

/** One result per command, in the order sent, and the game's sequence number after them. */
export const CommandReply = z.strictObject({
  protocolVersion: z.number().int().min(1),
  sequence: Ms,
  results: z.array(CommandResult).min(1).max(maxCommandsPerBatch),
});
export type CommandReply = z.infer<typeof CommandReply>;

/** The whole batch is turned away: a version the server no longer speaks. */
export const VersionRefusal = z.strictObject({
  error: z.literal('unsupported-protocol-version'),
  accepted: z.array(z.number().int().min(1)).min(1),
});
export type VersionRefusal = z.infer<typeof VersionRefusal>;

// ---------------------------------------------------------------- scoring session (T-116)

/** The lease runs out this long after the last renewal: "about two minutes". */
export const sessionLeaseSeconds = 120;
/** The tracker renews this often while it is open. */
export const sessionRenewSeconds = 30;

/** The tracker's own id for its device, made once and kept on the device (T-116). */
export const DeviceId = z.string().trim().min(1).max(200);

/**
 * What the tracker posts to `POST /api/v1/leagues/{leagueId}/games/{game}/session`
 * (record 039, T-251). The address names the game, as for the commands, so no
 * request carries it again; opening and taking over name the device.
 */
export const SessionRequest = z.discriminatedUnion('type', [
  /** Open the game to score. Answered `held-by-other` if another device holds it. */
  z.strictObject({ type: z.literal('open'), deviceId: DeviceId }),
  z.strictObject({ type: z.literal('renew'), sessionId: Id }),
  /** The scorekeeper has confirmed; the other device becomes read-only at once. */
  z.strictObject({
    type: z.literal('take-over'),
    deviceId: DeviceId,
    confirmed: z.literal(true),
    /** The `since` of the holder the scorekeeper saw; the server refuses if it has changed. */
    expectedHolderSince: Ms,
  }),
  z.strictObject({ type: z.literal('release'), sessionId: Id }),
]);
export type SessionRequest = z.infer<typeof SessionRequest>;

const Holder = z.strictObject({ displayName: z.string().max(120), since: Ms });

export const SessionReply = z.discriminatedUnion('status', [
  /** This device holds the game until `expiresAt` (server time, ms). `sentAt` is server time on every reply. */
  z.strictObject({
    status: z.literal('held-by-you'),
    sessionId: Id,
    expiresAt: Ms,
    sentAt: Ms,
  }),
  /** Someone else holds it. The tracker offers to take over. */
  z.strictObject({ status: z.literal('held-by-other'), holder: Holder, sentAt: Ms }),
  /** This session no longer holds the game: taken over, run out or released. */
  z.strictObject({
    status: z.literal('ended'),
    reason: z.enum(['taken-over', 'expired', 'released']),
    sentAt: Ms,
  }),
  /**
   * Not opened: the person may not score it, there is no such game, or it cannot be
   * scored now (decided, cancelled or postponed).
   */
  z.strictObject({
    status: z.literal('refused'),
    code: z.enum(['not-allowed', 'unknown-game', 'game-not-live']),
    sentAt: Ms,
  }),
]);
export type SessionReply = z.infer<typeof SessionReply>;

// ---------------------------------------------------------------- the engine's state (T-113, T-253)

/**
 * What `GET /api/v1/leagues/{leagueId}/games/{game}/state` answers a scorekeeper
 * (record 041): the engine's state as the server holds it, which the tracker loads on
 * opening the game and reloads after a refusal (T-113). The state is the engine's own
 * document (packages/sports), which this package cannot name: only the marks of its
 * version 1 are checked here, and the tracker reads it as the engine's. Never cached,
 * and never for visitors: it names every player by id.
 */
export const TrackerGameState = z.strictObject({
  /** The sequence number of the last tap in the state; 0 while there is none. */
  sequence: Ms,
  state: z.looseObject({
    version: z.literal(1),
    status: z.enum(['scheduled', 'live', 'final']),
    rules: z.looseObject({ periods: z.number().int().min(1) }),
    clock: z.looseObject({ remainingMs: z.number(), running: z.boolean() }),
    plays: z.array(z.unknown()),
    redo: z.array(z.unknown()),
    recent: z.array(z.string()),
  }),
});
export type TrackerGameState = z.infer<typeof TrackerGameState>;

// ---------------------------------------------------------------- the clock (T-121)

/**
 * The clock is sent as a reference, not every second: "running, this much left as of
 * this instant" or "stopped at this". `asOf` is server time in milliseconds; a viewer
 * counts down from it by itself.
 */
export const ClockReference = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('running'), remainingMs: Ms, asOf: Ms }),
  z.strictObject({ state: z.literal('stopped'), remainingMs: Ms }),
]);
export type ClockReference = z.infer<typeof ClockReference>;

// ---------------------------------------------------------------- what viewers see (T-117, T-118)

export const gameStatuses = ['scheduled', 'live', 'final'] as const;
export const GameStatus = z.enum(gameStatuses);
export type GameStatus = z.infer<typeof GameStatus>;

const Score = z.strictObject({ home: Ms, away: Ms });
const TeamFouls = z.strictObject({ home: Ms, away: Ms });

/**
 * The latest play, as facts. Names and numbers are only those the league and the team
 * allow to be shown (T-120); the page words it from its message file (T-187).
 *
 * The server must redact this to the most restrictive setting among everything that
 * receives it (S-22, T-87): one channel carries it to every viewer, so if either team
 * or the league hides names, numbers or points, it carries null here.
 */
export const LatestPlay = z.strictObject({
  type: z.enum(['score', 'foul', 'turnover', 'timeout', 'sub', 'period', 'other']),
  side: Side.optional(),
  playerName: z.string().max(120).nullable(),
  jersey: Jersey.min(1).nullable(),
  points: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});
export type LatestPlay = z.infer<typeof LatestPlay>;

/** The small numbered message published on a game's channel after each saved command. */
export const LiveMessage = z.strictObject({
  gameId: Id,
  /** Counts up by one per saved command; a viewer that sees a jump has missed one. */
  sequence: Ms,
  /** Server time when it was sent, in milliseconds: lets a device line its clock up. */
  sentAt: Ms,
  status: GameStatus,
  score: Score,
  period: z.number().int().min(1).max(20),
  clock: ClockReference,
  teamFouls: TeamFouls,
  latestPlay: LatestPlay.nullable(),
});
export type LiveMessage = z.infer<typeof LiveMessage>;

const SnapshotPlayer = z.strictObject({
  playerId: Id,
  side: Side,
  name: z.string().max(120).nullable(),
  jersey: z.string().max(2).nullable(),
  /** Null means hidden for this team (S-22, T-87); never zero standing in for hidden. */
  points: Ms.nullable(),
  fouls: Ms.nullable(),
  onCourt: z.boolean(),
});

/**
 * The game as it stands at one sequence number, for a page that is arriving, has found
 * a gap, or cannot hold a live connection (T-118, T-119). It carries everything a live
 * message does, so one rule can adopt either.
 */
export const GameSnapshot = LiveMessage.extend({
  periods: z.union([z.literal(2), z.literal(4)]),
  teams: z.strictObject({
    /** `statsVisible` false: this team's players carry null points and fouls (S-22, T-87). */
    home: z.strictObject({ name: z.string().max(120), statsVisible: z.boolean() }),
    away: z.strictObject({ name: z.string().max(120), statsVisible: z.boolean() }),
  }),
  /** As of this snapshot's sequence only; later messages do not update players. */
  players: z.array(SnapshotPlayer).max(200),
  /** Set when the game was reopened and finalised again; the date only (S-7). */
  correctedOn: z.iso.date().optional(),
});
export type GameSnapshot = z.infer<typeof GameSnapshot>;
